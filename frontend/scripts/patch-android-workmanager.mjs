import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const androidDir = path.join(root, 'android')
const appGradle = path.join(androidDir, 'app', 'build.gradle')
const javaDir = path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'agroconnect', 'mvp')

async function patchGradle() {
  let source = await readFile(appGradle, 'utf8')
  const dependency = `implementation "androidx.work:work-runtime:2.10.1"`
  if (source.includes(dependency)) return
  const marker = /dependencies\s*\{/
  if (!marker.test(source)) throw new Error('Не найден блок dependencies в android/app/build.gradle')
  source = source.replace(marker, (match) => `${match}\n    ${dependency}`)
  await writeFile(appGradle, source)
}

const mainActivity = `package com.agroconnect.mvp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeOutboxPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`

const plugin = `package com.agroconnect.mvp;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "NativeOutbox")
public class NativeOutboxPlugin extends Plugin {
    static final String PENDING_PREFS = "agroconnect-native-outbox";
    static final String COMPLETED_PREFS = "agroconnect-native-completed";
    static final String COMPLETED_IDS = "ids";
    static final String UNIQUE_WORK = "agroconnect-outbox-sync";

    @PluginMethod
    public void upsert(PluginCall call) {
        String itemJson = call.getString("itemJson");
        if (itemJson == null || itemJson.isEmpty()) {
            call.reject("itemJson is required");
            return;
        }
        try {
            JSONObject item = new JSONObject(itemJson);
            String clientId = item.getString("client_id");
            pending().edit().putString(clientId, itemJson).apply();
            schedule();
            call.resolve();
        } catch (Exception error) {
            call.reject("Invalid outbox item", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId != null) pending().edit().remove(clientId).apply();
        call.resolve();
    }

    @PluginMethod
    public void consumeCompleted(PluginCall call) {
        Set<String> saved = completed().getStringSet(COMPLETED_IDS, new HashSet<>());
        ArrayList<String> copy = new ArrayList<>(saved == null ? new HashSet<>() : saved);
        completed().edit().remove(COMPLETED_IDS).apply();
        JSArray ids = new JSArray();
        for (String id : copy) ids.put(id);
        JSObject result = new JSObject();
        result.put("clientIds", ids);
        call.resolve(result);
    }

    private SharedPreferences pending() {
        return getContext().getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE);
    }

    private SharedPreferences completed() {
        return getContext().getSharedPreferences(COMPLETED_PREFS, Context.MODE_PRIVATE);
    }

    private void schedule() {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(OutboxSyncWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(getContext()).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, request);
    }
}
`

const worker = `package com.agroconnect.mvp;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class OutboxSyncWorker extends Worker {
    public OutboxSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences pending = getApplicationContext().getSharedPreferences(NativeOutboxPlugin.PENDING_PREFS, Context.MODE_PRIVATE);
        Map<String, ?> rows = pending.getAll();
        if (rows.isEmpty()) return Result.success();

        boolean retry = false;
        ArrayList<Map.Entry<String, ?>> ordered = new ArrayList<>(rows.entrySet());
        ordered.sort((left, right) -> priority(right.getValue()) - priority(left.getValue()));

        for (Map.Entry<String, ?> entry : ordered) {
            if (!(entry.getValue() instanceof String)) continue;
            String clientId = entry.getKey();
            try {
                JSONObject item = new JSONObject((String) entry.getValue());
                int status = send(item, clientId);
                if (status >= 200 && status < 300) {
                    pending.edit().remove(clientId).apply();
                    markCompleted(clientId);
                    continue;
                }
                if (status == 408 || status == 429 || status >= 500) {
                    retry = true;
                    break;
                }
                // 4xx remains in the web outbox so the user can inspect/edit/delete it.
            } catch (Exception error) {
                retry = true;
                break;
            }
        }
        return retry ? Result.retry() : Result.success();
    }

    private static int priority(Object value) {
        if (!(value instanceof String)) return 0;
        try { return new JSONObject((String) value).optInt("priority", 0); }
        catch (Exception ignored) { return 0; }
    }

    private int send(JSONObject item, String clientId) throws Exception {
        URL url = new URL(item.getString("url"));
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(item.optString("method", "POST"));
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(20_000);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("X-AgroConnect-Operation", clientId);
        connection.setDoInput(true);

        if (!item.isNull("body")) {
            byte[] payload = item.get("body").toString().getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
        }

        int status = connection.getResponseCode();
        connection.disconnect();
        return status;
    }

    private void markCompleted(String clientId) {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences(NativeOutboxPlugin.COMPLETED_PREFS, Context.MODE_PRIVATE);
        Set<String> current = prefs.getStringSet(NativeOutboxPlugin.COMPLETED_IDS, new HashSet<>());
        HashSet<String> updated = new HashSet<>(current == null ? new HashSet<>() : current);
        updated.add(clientId);
        prefs.edit().putStringSet(NativeOutboxPlugin.COMPLETED_IDS, updated).apply();
    }
}
`

await mkdir(javaDir, { recursive: true })
await patchGradle()
await writeFile(path.join(javaDir, 'MainActivity.java'), mainActivity)
await writeFile(path.join(javaDir, 'NativeOutboxPlugin.java'), plugin)
await writeFile(path.join(javaDir, 'OutboxSyncWorker.java'), worker)
console.log('Android WorkManager outbox bridge installed.')

# Android build и проверка устройства

Документ фиксирует актуальный способ сборки AgroConnect для Android и минимальный ручной checklist перед демонстрацией.

## Важное правило сборки

Android-версию нужно собирать через:

```bash
npm run cap:sync
```

а не через обычную web-сборку `npm run build`.

`cap:sync` выполняет три шага:

1. собирает Capacitor-версию frontend без PWA service worker;
2. синхронизирует `dist` в Android-проект;
3. устанавливает native bridge для WorkManager/outbox и необходимые Android patch'и.

Это нужно, чтобы Android не использовал старый PWA cache и чтобы фоновая синхронизация была установлена в APK.

## Первый запуск после clone

`frontend/android/` не хранится в Git.

```bash
cd frontend
npm install
npx cap add android
npm run cap:sync
```

После этого Android-проект можно открыть:

```bash
npm run cap:open
```

или собрать debug APK:

```bash
npm run android:debug
```

## Android Emulator

Backend на host-машине доступен эмулятору как `10.0.2.2`.

Самый простой вариант:

```bash
ANDROID_MODE=emulator bash scripts/android-device.sh
```

Скрипт собирает Capacitor frontend с:

```text
VITE_API_URL=http://10.0.2.2:8000
```

и устанавливает debug APK на запущенный эмулятор.

## Физическое устройство по USB

1. Включить Developer options и USB debugging.
2. Подключить телефон и подтвердить RSA fingerprint.
3. Убедиться, что локальный backend отвечает на `localhost:8000`.
4. Выполнить:

```bash
ANDROID_MODE=usb bash scripts/android-device.sh
```

Скрипт использует:

```bash
adb reverse tcp:8000 tcp:8000
```

и собирает приложение с:

```text
VITE_API_URL=http://127.0.0.1:8000
```

Так телефон и ноутбук не обязаны находиться в одной Wi-Fi сети.

## Физическое устройство через LAN

```bash
ANDROID_MODE=lan \
ANDROID_BACKEND_URL=http://192.168.1.20:8000 \
bash scripts/android-device.sh
```

Телефон и backend должны видеть друг друга по сети, а порт `8000` должен быть доступен.

## Публичный backend

Для APK, который должен работать независимо от ноутбука, перед сборкой задайте публичный URL:

```bash
cd frontend
VITE_API_URL=http://example-host:8000 npm run cap:sync
```

Для production вместо HTTP должен использоваться HTTPS.

## Как проверить URL внутри Android build

После `npm run cap:sync`:

```bash
grep -RohE 'https?://[^"[:space:]]+:?[0-9]*' \
  android/app/src/main/assets/public/assets/*.js \
  | sort -u
```

Перед установкой также можно проверить собранный APK:

```bash
unzip -p android/app/build/outputs/apk/debug/app-debug.apk \
  'assets/public/assets/*.js' \
  | grep -oE 'https?://[^"[:space:]]+:?[0-9]*' \
  | sort -u
```

## Clean install

Перед финальной проверкой новой сборки:

```bash
adb uninstall com.agroconnect.mvp || true
adb install frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

После чистой установки должен появиться экран выбора тестового пользователя.

## Обязательный ручной checklist

### Старт

- приложение устанавливается и запускается;
- при чистой установке отображается выбор тестового пользователя;
- backend доступен;
- после выбора пользователь открывает ленту.

### Лента и публикация

- публикации отображаются;
- работают реакции и комментарии;
- создание публикации предлагает две отдельные области: сделать фото и выбрать из галереи;
- публикация с фото успешно создаётся.

### Поля

- список полей открывается;
- отображается карта/контур;
- доступна история севооборота;
- отображается текущая погода;
- открывается прогноз на 3 дня.

### Соседи

- экран «Соседи» открывается без общей ошибки;
- отображаются явные соседи;
- отображается блок хозяйств рядом;
- запрос доступа к полям создаётся;
- после восстановления сети экран автоматически обновляется.

### Офлайн

- нажать «Поехал в поля» при наличии сети;
- отключить сеть;
- ранее загруженные данные остаются доступны;
- создать действие, которое поддерживает outbox;
- действие отображается в очереди;
- включить сеть;
- очередь синхронизируется автоматически либо через «Отправить сейчас».

### Android UX

- контент не залезает под status bar/cutout;
- нижняя навигация не перекрывает модальные панели и очередь;
- основные touch targets удобно нажимаются;
- интерфейс читаем при высокой яркости;
- случайный поворот устройства не ломает экран.

## Диагностика WebView

Проверить подключённые устройства:

```bash
adb devices
```

Для сетевых ошибок:

```bash
adb logcat | grep -i -E 'Capacitor|chromium|ERR_|network|cleartext|mixed content'
```

Для более подробной диагностики WebView можно использовать desktop Chrome:

```text
chrome://inspect/#devices
```

## Если Android Studio показывает старый frontend

1. Выполнить `npm run cap:sync`.
2. Проверить нужный текст в `android/app/src/main/assets/public`.
3. Удалить `frontend/android/app/build`, если нужно исключить старый Gradle output.
4. Собрать APK заново.
5. Проверить содержимое самого APK через `unzip -p`.
6. При необходимости выполнить clean uninstall приложения перед установкой.

Capacitor build специально не регистрирует PWA service worker: Android должен использовать assets текущего APK, а не старую web-оболочку из service-worker cache.

## Критерий готовности

Android-часть считается готовой к демонстрации, когда свежий APK установлен на чистое физическое устройство и пройден основной сценарий: пользователь → лента → поле/погода → соседи → публикация → офлайн-очередь → восстановление сети.

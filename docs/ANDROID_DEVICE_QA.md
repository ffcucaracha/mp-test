# Stage 15 — Android и offline-risk testing

Цель этапа — получить воспроизводимую Android-сборку и проверить риски, которые не видны в обычном desktop browser: доступ к backend, камера, WebView, safe-area, медленная сеть и работа на небольшом экране.

## Что зафиксировано в коде

- Capacitor использует HTTP scheme и `cleartext: true` для hackathon/dev-сборки, чтобы Android WebView не блокировал локальный HTTP backend как mixed content.
- API client имеет таймаут (по умолчанию 15 секунд) и понятные ошибки при недоступном backend/медленной сети.
- Добавлены safe-area сверху и снизу, минимальные touch targets 44 px, размер полей ввода 16 px и mobile focus styles.
- CI собирает debug APK после каждого изменения frontend.
- Есть единый helper `scripts/android-device.sh` для эмулятора и физического устройства.

> Для production HTTP/cleartext нужно убрать и использовать HTTPS. Текущая настройка сознательно предназначена для MVP и локального тестирования.

## Эмулятор Android Studio

Backend должен быть запущен на host:

```bash
docker compose up -d --build
```

Сборка, установка и запуск:

```bash
ANDROID_MODE=emulator bash scripts/android-device.sh
```

В режиме emulator backend автоматически используется по адресу:

```text
http://10.0.2.2:8000
```

## Физическое устройство по USB — рекомендуемый вариант

1. Включить Developer options и USB debugging.
2. Подключить телефон по USB и подтвердить RSA fingerprint.
3. Убедиться, что backend работает локально на порту 8000.
4. Запустить:

```bash
ANDROID_MODE=usb bash scripts/android-device.sh
```

Helper выполняет:

```text
adb reverse tcp:8000 tcp:8000
VITE_API_URL=http://127.0.0.1:8000 npm run build
npx cap sync android
./gradlew installDebug
```

Это не требует, чтобы телефон и ноутбук находились в одной Wi-Fi сети.

## Физическое устройство через LAN

Backend должен слушать не только localhost, но и внешний интерфейс host. Телефон и ноутбук должны находиться в одной сети.

Пример:

```bash
ANDROID_MODE=lan \
ANDROID_BACKEND_URL=http://192.168.1.20:8000 \
bash scripts/android-device.sh
```

Если соединения нет, проверить host firewall и доступность порта 8000.

## API timeout

По умолчанию запрос считается зависшим через 15 секунд:

```text
VITE_API_TIMEOUT_MS=15000
```

Для smoke-теста медленной/оборванной сети можно временно уменьшить значение:

```bash
VITE_API_TIMEOUT_MS=3000 \
ANDROID_MODE=emulator \
bash scripts/android-device.sh
```

## Обязательный ручной checklist на Android

Автоматический CI подтверждает сборку APK, но не может честно подтвердить физическую камеру, читаемость на солнце или конкретную сеть телефона. Перед питчем пройти этот checklist на реальном устройстве.

### Clean install

- удалить предыдущую AgroConnect MVP;
- установить debug APK/helper-скриптом;
- приложение стартует с чистого состояния;
- список тестовых пользователей загружается.

### Основной сценарий

- выбрать тестового пользователя;
- открыть ленту;
- открыть поля;
- увидеть карту/OSM preview;
- создать публикацию;
- выбрать фото из галереи;
- сделать фото камерой через `capture="environment"`;
- поставить реакцию;
- добавить комментарий;
- открыть предупреждения;
- перейти к профилю и соседям.

### Android UX

- верхняя панель не залезает под status bar/camera cutout;
- нижняя навигация не конфликтует с gesture area;
- основные кнопки удобно нажимаются большим пальцем;
- текст и controls читаются без zoom;
- landscape не является обязательным основным режимом, но приложение не должно ломаться при случайном повороте.

### Нет backend

1. Открыть приложение.
2. Остановить backend:

```bash
docker compose stop backend
```

3. Повторить действие, требующее API.
4. Пользователь должен получить понятную ошибку `Нет связи с AgroConnect...` или сообщение о timeout, а не бесконечный spinner/blank screen.

После теста:

```bash
docker compose start backend
```

### Медленная сеть

На эмуляторе включить ограниченный network profile либо использовать DevTools throttling для WebView. Проверить:

- экран не зависает навсегда;
- после timeout появляется понятная ошибка;
- после восстановления сети можно повторить действие без перезапуска приложения.

### Читаемость на улице

Проверить на реальном устройстве при высокой яркости:

- заголовки и основной текст различимы;
- серый secondary text не теряется полностью;
- status chips, кнопки и предупреждения различимы;
- critical actions не зависят только от слабого цветового контраста.

## Диагностика WebView

Helper печатает путь к adb. Для сетевых проблем:

```bash
/path/to/adb logcat | grep -i -E "Capacitor|chromium|ERR_|network|cleartext|mixed content"
```

Также можно использовать desktop Chrome:

```text
chrome://inspect/#devices
```

и смотреть Console + Network WebView приложения.

## Критерий завершения

Техническая часть этапа считается готовой, когда CI собирает APK, а manual gate — когда свежий APK установлен на чистое физическое Android-устройство и основной сценарий выше пройден без блокирующей ошибки.

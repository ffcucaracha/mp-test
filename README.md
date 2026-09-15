# AgroConnect MVP

AgroConnect — мобильное приложение для сельхозпроизводителей: рабочий дневник полей, локальная сеть взаимопомощи, предупреждения и AI-предварительный анализ состояния растений.

Один клиент на React + TypeScript используется сразу в двух вариантах:

- web/PWA;
- Android APK через Capacitor.

Серверная часть — FastAPI + PostgreSQL.

## Стек

### Frontend / mobile

- React + TypeScript;
- Vite;
- `vite-plugin-pwa` для web/PWA;
- Capacitor для Android APK из той же кодовой базы;
- IndexedDB для локального кэша и outbox;
- Android WorkManager для фоновой отправки накопленной очереди.

### Backend

- Python 3.12;
- FastAPI;
- SQLAlchemy 2;
- Alembic;
- PostgreSQL.

### Infrastructure

- Docker + Docker Compose;
- Swagger / ReDoc / OpenAPI для API;
- GitHub Actions для smoke-тестов и Android debug build.

## Что реализовано в MVP

- профиль хозяйства;
- поля с координатами и контурами;
- севооборот и история сезонов;
- локальная лента публикаций;
- личные записи «Только для меня»;
- реакции и комментарии;
- поиск хозяйств рядом;
- явная связь «Сосед», не зависящая только от географии;
- запрос доступа сразу ко всем полям хозяйства;
- пасеки и предупреждения об обработках;
- погодные предупреждения;
- прогноз на 3 дня;
- AI/ML-анализ фото с подтверждением или исправлением результата человеком;
- офлайн-кэш, очередь действий и режим «Поехал в поля»;
- продуктовые метрики и внутренний dashboard;
- тестовые monetization-гипотезы без реальных платежей.

> Авторизация в MVP намеренно упрощена: текущий тестовый пользователь выбирается из списка, а его `userId` хранится локально. Это демонстрационный механизм, не production-auth.

## Погода

Прогноз запрашивается через backend по координатам поля. Основной внешний источник — Open-Meteo.

AgroConnect также умеет импортировать метеостанции компании. Если ближайшая доступная станция находится не дальше **50 км**, её последние фактические измерения используются как источник текущей погоды. Если подходящей станции нет или её данные временно недоступны, прогноз продолжает работать через Open-Meteo.

Клиент кэширует прогноз по каждому полю:

- если сохранённые данные старше 3 часов и есть сеть, прогноз обновляется;
- при восстановлении сети выполняется повторная проверка;
- сохранённый прогноз доступен офлайн до 72 часов;
- интерфейс показывает возраст данных.

## ML / AI-анализ

Backend использует единый интерфейс провайдера. Поддерживаются:

- `kindwise` — crop.health;
- `gemini` — мультимодальная модель;
- `plantvillage` — локальная ONNX-модель на backend;
- `demo` — детерминированный режим для CI и стабильной демонстрации.

ML не позиционируется как диагноз. Пользователь подтверждает, отклоняет или исправляет гипотезу, а результат сохраняется вместе с feedback для будущего размеченного датасета.

Подробнее: [docs/ML_PLANT_HEALTH.md](docs/ML_PLANT_HEALTH.md).

## Офлайн-режим

После хотя бы одного успешного онлайн-запуска приложение умеет показывать ранее загруженные данные и сохранять изменяющие действия в локальный outbox.

В очередь могут попадать, в частности:

- публикации;
- реакции;
- комментарии;
- записи севооборота;
- создание поля;
- предупреждения об обработках.

На Android очередь зеркалируется в native storage и может отправляться через WorkManager после восстановления сети. Подробнее: [docs/OFFLINE_FIELD_MODE.md](docs/OFFLINE_FIELD_MODE.md).

## Запуск через Docker

```bash
git clone https://github.com/ffcucaracha/mp-test.git
cd mp-test
cp .env.example .env
docker compose up --build
```

После запуска:

- приложение: `http://localhost:5173`;
- Swagger: `http://localhost:8000/docs`;
- ReDoc: `http://localhost:8000/redoc`;
- OpenAPI JSON: `http://localhost:8000/openapi.json`;
- dashboard: `http://localhost:8000/internal/dashboard`;
- healthcheck: `http://localhost:8000/api/health`.

Остановить:

```bash
docker compose down
```

Полностью удалить локальную demo-базу:

```bash
docker compose down -v
```

## Конфигурация внешних сервисов

Секреты не хранятся в Git. Пример переменных находится в `.env.example`.

Для Kindwise:

```dotenv
PLANT_HEALTH_PROVIDER=kindwise
CROP_HEALTH_API_KEY=...
```

Для Gemini:

```dotenv
PLANT_HEALTH_PROVIDER=gemini
GEMINI_API_KEY=...
```

Для API метеостанций компании:

```dotenv
COMPANY_API_URL=...
COMPANY_API_EMAIL=...
COMPANY_API_PASSWORD=...
```

Без ML-ключей можно использовать `PLANT_HEALTH_PROVIDER=demo`.

## Web / PWA

```bash
cd frontend
npm install
npm run build
npm run preview -- --host 0.0.0.0
```

Для размещения PWA вне `localhost` нужен HTTPS.

## Android APK через Capacitor

`frontend/android/` не хранится в Git и создаётся локально.

Первый запуск после clone:

```bash
cd frontend
npm install
npx cap add android
npm run cap:sync
npm run cap:open
```

После любых изменений frontend для Android используйте именно:

```bash
npm run cap:sync
```

Эта команда:

1. собирает отдельный Capacitor build без PWA service worker;
2. синхронизирует web assets в Android-проект;
3. устанавливает native bridge для фоновой outbox-синхронизации.

Debug APK из терминала:

```bash
npm run android:debug
```

Либо после `npm run cap:sync` можно открыть `frontend/android` в Android Studio и собрать APK через Android Studio.

### Backend URL для Android

API URL задаётся через `VITE_API_URL` во время сборки.

Android Emulator:

```bash
VITE_API_URL=http://10.0.2.2:8000 npm run cap:sync
```

Физический телефон через LAN:

```bash
VITE_API_URL=http://192.168.1.50:8000 npm run cap:sync
```

Для установки через USB удобнее использовать:

```bash
ANDROID_MODE=usb bash scripts/android-device.sh
```

Подробный чек-лист: [docs/ANDROID_DEVICE_QA.md](docs/ANDROID_DEVICE_QA.md).

## Метеостанции компании

AgroConnect хранит импортированный список станций в своей БД.

После настройки `COMPANY_API_*` синхронизация выполняется так:

```bash
curl -X POST http://localhost:8000/api/internal/weather-stations/sync
```

Импорт использует API авторизации и API устройств/метеостанций. Маршруты внешней системы по полям AgroConnect не использует.

## Документация

- [docs/API.md](docs/API.md) — краткая карта основных API-сценариев; полный контракт всегда доступен через OpenAPI;
- [docs/DEMO_DATA.md](docs/DEMO_DATA.md) — актуальные demo/seed данные;
- [docs/ANDROID_DEVICE_QA.md](docs/ANDROID_DEVICE_QA.md) — Android build и ручная проверка;
- [docs/OFFLINE_FIELD_MODE.md](docs/OFFLINE_FIELD_MODE.md) — офлайн-архитектура;
- [docs/ML_PLANT_HEALTH.md](docs/ML_PLANT_HEALTH.md) — ML-провайдеры и human-in-the-loop;
- [docs/DEMO_VIDEO.md](docs/DEMO_VIDEO.md) — только сценарий демонстрационного ролика;
- [docs/SRS_LIGHT.md](docs/SRS_LIGHT.md), [docs/MVP_DECISIONS.md](docs/MVP_DECISIONS.md), [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — исходная продуктовая рамка, решения и план начала хакатона; они сохраняются как исторические документы и не являются точным описанием текущего состояния кода.

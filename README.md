# AgroConnect MVP

Предварительный каркас мобильной социальной сети для фермеров. Один React-фронтенд можно запускать как PWA или упаковывать в Android APK через Capacitor. Серверная часть — FastAPI + PostgreSQL.

## Стек

### Frontend / mobile
- React + TypeScript
- Vite
- `vite-plugin-pwa` — PWA и установка на главный экран
- Capacitor — Android-обёртка и сборка APK из того же frontend-кода

### Backend
- Python
- FastAPI
- SQLAlchemy 2
- PostgreSQL

### Infrastructure
- Docker + Docker Compose для dev-окружения

## Что уже есть в каркасе

- `GET /api/health` — минимальный ping сервера;
- 4 тестовых пользователя;
- экран входа через выбор тестового пользователя;
- экран ленты в стиле Twitter/X;
- экран профиля с личной информацией;
- данные пользователей и постов хранятся в PostgreSQL и автоматически создаются при первом запуске;
- мобильная нижняя навигация;
- PWA-конфигурация;
- конфигурация Capacitor для дальнейшей сборки Android APK.

> Авторизация пока намеренно тестовая: выбранный `userId` хранится в `localStorage`. Для MVP это позволяет быстро работать над пользовательскими сценариями, не тратя время на полноценный auth.

## Структура

```text
.
├── backend/
│   ├── app/main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── capacitor.config.ts
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Запуск в dev-режиме

Нужны Docker и Docker Compose.

```bash
git clone https://github.com/ffcucaracha/mp-test.git
cd mp-test
docker compose up --build
```

После запуска:

- приложение: `http://localhost:5173`
- Swagger FastAPI: `http://localhost:8000/docs`
- ping: `http://localhost:8000/api/health`
- PostgreSQL: `localhost:5432`

Для остановки:

```bash
docker compose down
```

Удалить также dev-базу:

```bash
docker compose down -v
```

Frontend и backend подключены как volumes, поэтому изменения исходников подхватываются без пересборки контейнеров.

## Мобильный вариант 1: PWA

PWA использует тот же React-код. Для production-сборки:

```bash
cd frontend
npm install
npm run build
```

Результат появится в `frontend/dist`.

Для локальной проверки production-сборки:

```bash
npm run preview -- --host 0.0.0.0
```

При открытии приложения на поддерживаемом мобильном браузере его можно установить через пункт браузера **«Добавить на главный экран» / «Установить приложение»**.

Для реального размещения PWA нужен HTTPS (кроме `localhost`).

## Мобильный вариант 2: Android APK через Capacitor

### Требования

На машине для Android-сборки должны быть установлены:

- Node.js + npm;
- Android Studio;
- Android SDK;
- JDK, совместимый с текущей версией Android Gradle Plugin.

### Первый запуск

```bash
cd frontend
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

В Android Studio можно запустить приложение на эмуляторе/телефоне или собрать APK через **Build → Build App Bundles or APKs → Build APKs**.

После изменений frontend:

```bash
npm run build
npx cap sync android
```

Затем снова запуск/сборка из Android Studio.

### API при запуске Android

Браузер на компьютере видит backend по `http://localhost:8000`, но для Android это другой хост.

Для Android Emulator:

```bash
VITE_API_URL=http://10.0.2.2:8000 npm run build
npx cap sync android
```

Для физического телефона укажи LAN-IP компьютера, например:

```bash
VITE_API_URL=http://192.168.1.50:8000 npm run build
npx cap sync android
```

Телефон и компьютер должны быть в одной сети, а порт `8000` доступен с телефона.

Для production позже нужно будет указывать публичный HTTPS API:

```bash
VITE_API_URL=https://api.example.com npm run build
npx cap sync android
```

## Локальный запуск без Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL='postgresql+psycopg://agroconnect:agroconnect@localhost:5432/agroconnect'
uvicorn app.main:app --reload
```

PostgreSQL при этом нужно запустить отдельно.

### Frontend

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

## Следующие логичные шаги для хакатона

Сейчас это специально тонкий vertical slice: mobile UI → API → PostgreSQL. Дальше поверх него можно добавлять реальные сценарии AgroConnect: публикацию поста/проблемы с фото, комментарии, реакции, категории, географию, загрузку медиа и ML/AI-функцию на Python-бэкенде.

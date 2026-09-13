# AgroConnect MVP

Мобильное приложение для малых сельхозпроизводителей: дневник полей, локальная сеть взаимопомощи, предупреждения и AI-предварительная диагностика растений. Один React-клиент можно запускать как PWA или упаковывать в Android APK через Capacitor; серверная часть — FastAPI + PostgreSQL.

## Техническое описание

### Стек

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

### Архитектура и документация

- API документирован через Swagger (`/docs`), ReDoc (`/redoc`) и OpenAPI JSON (`/openapi.json`); сценарии описаны в [docs/API.md](docs/API.md).
- Данные и миграции хранятся в PostgreSQL; демо-данные создаются при первом запуске.
- Внутренняя панель жюри: `http://localhost:8000/internal/dashboard`. Она строится по данным текущей БД.
- `GET /api/health` — проверка доступности backend.

> Авторизация в MVP намеренно тестовая: выбранный `userId` хранится в `localStorage`. Это демонстрационный механизм, не production-auth.

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

## Продуктовая часть

- профиль хозяйства и поля с контурами;
- лента в выбранном радиусе и публикации добавленных соседей независимо от расстояния;
- личный дневник: запись «Только для меня» не попадает в общую ленту;
- поиск хозяйств рядом, добавление в соседи и единый запрос доступа ко всем полям хозяйства;
- предупреждения о погоде, обработках и проблемах растений;
- AI-анализ фото с подтверждением или исправлением результата фермером;
- офлайн-кэш полей, ленты и актуальной погоды; режим «Поехал в поля»;
- форма обратной связи и метрики для проверки гипотез.

Прогноз поступает из Open-Meteo. Станции компании импортируются в БД отдельно и назначаются новому полю лишь при расстоянии до **30 км**; иначе поле остаётся на Open-Meteo. Маршруты компании по `/fields/...` не используются.

## Запуск и режимы

### Docker — рекомендуемый dev-режим

Нужны Docker и Docker Compose.

```bash
git clone https://github.com/ffcucaracha/mp-test.git
cd mp-test
cp .env.example .env
docker compose up --build
```

После запуска:

- приложение: `http://localhost:5173`
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
- панель жюри: `http://localhost:8000/internal/dashboard`

### Внешние сервисы

Без ключей приложение работает в режиме `Demo · offline`: он нужен для показа сценария, но не делает реальную диагностику. Все настройки собраны в `.env.example`. Для Kindwise задайте:

```dotenv
PLANT_HEALTH_PROVIDER=kindwise
CROP_HEALTH_API_KEY=ваш_ключ_Kindwise
```

Затем выполните `docker compose up -d --build`. Для Gemini вместо этого задайте
`PLANT_HEALTH_PROVIDER=gemini` и `GEMINI_API_KEY`. Ключи не добавляйте в Git.
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

### Метеостанции компании

AgroConnect хранит перечень доступных метеостанций и время синхронизации в своей БД. Заполните локальный `.env` (не добавляйте его в Git):

```dotenv
COMPANY_API_URL=https://api.company.example
COMPANY_API_EMAIL=ваш_email
COMPANY_API_PASSWORD=ваш_пароль
```

После запуска backend выполните однократный импорт:

```bash
curl -X POST http://localhost:8000/api/internal/weather-stations/sync
```

Импорт использует только `POST /api/auth/login` и `GET /api/weather-sensor/api/devices`. При создании поля оно привязывается к ближайшей станции, если та находится не дальше **30 км**; иначе прогноз и предупреждения продолжают работать через Open-Meteo. Маршруты компании по `/fields/...` намеренно не вызываются.

### Frontend

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

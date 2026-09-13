from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .features import router as features_router
from .feedback import router as feedback_router
from .monetization import router as monetization_router
from .plant_health_routes import router as plant_health_router
from .product_metrics import router as product_metrics_router
from .seed import seed_data
from .weather_routes import router as weather_router

app = FastAPI(
    title="AgroConnect MVP API",
    version="0.9.0",
    summary="API географической сети взаимопомощи для сельхозпроизводителей.",
    description="""
## Назначение

AgroConnect хранит поля и их историю, локальную ленту, соседей, предупреждения и заявки
на доступ ко всем полям хозяйства.

## Демо-аутентификация

В MVP авторизация упрощена: идентификатор текущего пользователя передаётся как `user_id`
в query-параметре или теле запроса. В production его должен заменять токен авторизации.

## Приватность хозяйства

Режим доступа применяется **сразу ко всем полям одного владельца**: `A` — открыто,
`B` — доступ после одобрения владельцем заявки соседа.
""",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "System", "description": "Проверка доступности сервиса."},
        {"name": "Users", "description": "Тестовые пользователи и профиль хозяйства."},
        {"name": "Fields", "description": "Поля, видимость и севооборот."},
        {"name": "Feed", "description": "Локальная лента, публикации и реакции."},
        {"name": "Neighbors", "description": "Поиск хозяйств рядом, соседи и доступ ко всем полям."},
        {"name": "Alerts", "description": "Пасеки, погодные и технологические предупреждения."},
        {"name": "Plant health", "description": "Анализ состояния растений и обратная связь."},
        {"name": "Product", "description": "Метрики, эксперименты и обратная связь MVP."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(product_metrics_router)
app.include_router(features_router)
app.include_router(weather_router)
app.include_router(plant_health_router)
app.include_router(monetization_router)
app.include_router(feedback_router)


@app.on_event("startup")
def startup() -> None:
    seed_data()

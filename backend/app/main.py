from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .features import router as features_router
from .monetization import router as monetization_router
from .plant_health_routes import router as plant_health_router
from .product_metrics import router as product_metrics_router
from .seed import seed_data
from .weather_routes import router as weather_router

app = FastAPI(title="AgroConnect MVP API", version="0.7.0")

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


@app.on_event("startup")
def startup() -> None:
    seed_data()

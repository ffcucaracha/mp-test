from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .features import router as features_router
from .seed import seed_data
from .weather_routes import router as weather_router

app = FastAPI(title="AgroConnect MVP API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(features_router)
app.include_router(weather_router)


@app.on_event("startup")
def startup() -> None:
    seed_data()

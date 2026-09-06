from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .seed import seed_data

app = FastAPI(title="AgroConnect MVP API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
def startup() -> None:
    seed_data()

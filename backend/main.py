from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth, catches, vehicles, leaderboard, model_update, satellites

app = FastAPI(title="Chadongcha API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/auth",       tags=["auth"])
app.include_router(catches.router,       prefix="/catches",    tags=["catches"])
app.include_router(vehicles.router,      prefix="/vehicles",   tags=["vehicles"])
app.include_router(leaderboard.router,   prefix="/leaderboard",tags=["leaderboard"])
app.include_router(model_update.router,  prefix="/model",      tags=["model"])
app.include_router(satellites.router,    prefix="/satellites", tags=["satellites"])


@app.get("/health")
def health():
    return {"status": "ok"}

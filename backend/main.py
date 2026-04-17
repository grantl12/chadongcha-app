from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import settings
from routers import auth, catches, vehicles, leaderboard, model_update, satellites, territory, players, market, uploads, community, shop, feed, boosts, crews

app = FastAPI(title="Chadongcha API", version="0.1.0")

# Rate limiting (in-memory; no Redis required)
app.state.limiter = auth._limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list(),
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
app.include_router(territory.router,     prefix="/territory",  tags=["territory"])
app.include_router(players.router,       prefix="/players",    tags=["players"])
app.include_router(market.router,        prefix="/market",     tags=["market"])
app.include_router(uploads.router,       prefix="/uploads",    tags=["uploads"])
app.include_router(community.router,     prefix="/community",  tags=["community"])
app.include_router(shop.router,          prefix="/shop",       tags=["shop"])
app.include_router(feed.router,          prefix="/feed",       tags=["feed"])
app.include_router(boosts.router,        prefix="/boosts",     tags=["boosts"])
app.include_router(crews.router,         prefix="/crews",      tags=["crews"])


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok"}

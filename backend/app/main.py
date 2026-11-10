import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import init_db
from app.deps import GuestCookieMiddleware
from app.research.pipeline import recover_interrupted
from app.routers import discoveries, library, opportunities, settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("signalhunter")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    n = recover_interrupted()
    if n:
        log.info("Marked %s interrupted discoveries as failed (retryable)", n)
    s = get_settings()
    log.info("Server-default AI key: %s | search provider setting: %s", s.llm_configured, s.search_provider)
    yield


app = FastAPI(title="MarketMind API", version="0.1.0", lifespan=lifespan)
app.add_middleware(GuestCookieMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = [
        {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()
    ]
    first = errors[0] if errors else {"field": "", "message": "Invalid request"}
    return JSONResponse(status_code=422, content={"detail": f"{first['field']}: {first['message']}".strip(": "), "errors": errors})


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(discoveries.router)
app.include_router(opportunities.router)
app.include_router(library.router)
app.include_router(settings.router)

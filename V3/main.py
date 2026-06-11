from __future__ import annotations
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from core.db import init_db
from api.classes import router as classes_router
from api.students import router as students_router
from api.sessions import router as sessions_router
from api.export import router as export_router

BASE_DIR = Path(__file__).parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Paulus Shuffle",
    version="3.0.0",
    description="Smart classroom seating randomiser",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(classes_router)
app.include_router(students_router)
app.include_router(sessions_router)
app.include_router(export_router)

app.mount("/static",  StaticFiles(directory=str(BASE_DIR / "static")),  name="static")
app.mount("/locales", StaticFiles(directory=str(BASE_DIR / "locales")), name="locales")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(str(BASE_DIR / "templates" / "index.html"))


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    # Let the SPA handle client-side routes
    return FileResponse(str(BASE_DIR / "templates" / "index.html"))

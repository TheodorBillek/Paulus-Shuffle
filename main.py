from __future__ import annotations
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.generate import router as generate_router
from api.export import router as export_router

BASE_DIR = Path(__file__).parent

app = FastAPI(
    title="Shuffle Service",
    version="4.0.0",
    description="Smart classroom seating randomiser",
    docs_url="/api/docs",
    redoc_url=None,
)

app.include_router(generate_router)
app.include_router(export_router)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(str(BASE_DIR / "templates" / "index.html"))


@app.get("/present", include_in_schema=False)
async def present():
    return FileResponse(str(BASE_DIR / "templates" / "present.html"))

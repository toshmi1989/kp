import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .auth import hash_password
from .config import ADMIN_PASSWORD, ADMIN_USERNAME, FRONTEND_DIST, normalized_base_path
from .db import Base, SessionLocal, engine
from .models import User
from .routers import auth, proposals, services

log = logging.getLogger("kp")


def init_db() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(User.id).limit(1)):
            db.add(User(username=ADMIN_USERNAME, full_name="Администратор", is_admin=True,
                        password_hash=hash_password(ADMIN_PASSWORD)))
            db.commit()
            log.warning("Создан пользователь %s — смените пароль после первого входа", ADMIN_USERNAME)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def _mount_frontend(app: FastAPI, base: str) -> None:
    if not FRONTEND_DIST.exists():
        return
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount(f"{base}/assets" if base else "/assets", StaticFiles(directory=assets), name="assets")

    index = FRONTEND_DIST / "index.html"

    def spa_file(path: str) -> FileResponse:
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and FRONTEND_DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(index)

    if not base:
        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            return spa_file(path)
        return

    @app.get(base, include_in_schema=False)
    @app.get(f"{base}/", include_in_schema=False)
    def spa_index():
        return FileResponse(index)

    @app.get(f"{base}/{{full_path:path}}", include_in_schema=False)
    def spa_prefixed(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(404, "Not Found")
        return spa_file(full_path)


def create_app() -> FastAPI:
    base = normalized_base_path()
    app = FastAPI(title="Генератор КП", docs_url=f"{base}/api/docs",
                  openapi_url=f"{base}/api/openapi.json", lifespan=lifespan)
    router_prefix = {"prefix": base} if base else {}
    app.include_router(auth.router, **router_prefix)
    app.include_router(services.router, **router_prefix)
    app.include_router(proposals.router, **router_prefix)

    @app.get(f"{base}/api/health" if base else "/api/health")
    def health():
        return {"ok": True}

    _mount_frontend(app, base)
    return app


app = create_app()

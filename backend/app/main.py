import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .auth import hash_password
from .config import ADMIN_PASSWORD, ADMIN_USERNAME, FRONTEND_DIST
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


app = FastAPI(title="Генератор КП", docs_url="/api/docs", openapi_url="/api/openapi.json",
              lifespan=lifespan)
app.include_router(auth.router)
app.include_router(services.router)
app.include_router(proposals.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# собранный фронтенд (SPA): всё, что не /api, отдаёт index.html
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and FRONTEND_DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")

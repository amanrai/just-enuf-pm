from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.services.errors import DomainError, NotFoundError, ValidationError


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def not_found_handler(_, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationError)
    async def validation_handler(_, exc: ValidationError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(DomainError)
    async def domain_handler(_, exc: DomainError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

from fastapi import APIRouter

from app.api.routes import agents, comments, entity_assets, panic_stop, project_properties, projects, skill_defaults, tags, task_properties, task_types, tasks

api_router = APIRouter()
api_router.include_router(agents.router)
api_router.include_router(projects.router)
api_router.include_router(project_properties.router)
api_router.include_router(task_properties.router)
api_router.include_router(skill_defaults.router)
api_router.include_router(task_types.router)
api_router.include_router(tasks.router)
api_router.include_router(tags.router)
api_router.include_router(comments.router)
api_router.include_router(panic_stop.router)
api_router.include_router(entity_assets.router)

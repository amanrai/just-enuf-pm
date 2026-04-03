from app.models.task_type import TaskTypeTemplate
from app.services.utils import dumps_json, new_id


DEFAULT_TASK_TYPE_TEMPLATES = [
    {
        "key": "debate",
        "name": "Debate",
        "color": "#a855f7",
        "icon": "messages-square",
        "behavior": {"allow_dependencies": False, "allow_child_tasks": True},
    },
    {
        "key": "research",
        "name": "Research",
        "color": "#0f766e",
        "icon": "search",
        "behavior": {"allow_dependencies": True, "allow_child_tasks": True},
    },
    {
        "key": "work",
        "name": "Work",
        "color": "#2563eb",
        "icon": "hammer",
        "behavior": {"allow_dependencies": True, "allow_child_tasks": True},
    },
    {
        "key": "feature",
        "name": "Feature",
        "color": "#7c3aed",
        "icon": "sparkles",
        "behavior": {"allow_dependencies": True, "allow_child_tasks": True},
    },
]


def build_default_templates() -> list[TaskTypeTemplate]:
    return [
        TaskTypeTemplate(
            id=new_id(),
            key=item["key"],
            name=item["name"],
            color=item["color"],
            icon=item["icon"],
            behavior_json=dumps_json(item["behavior"]),
        )
        for item in DEFAULT_TASK_TYPE_TEMPLATES
    ]

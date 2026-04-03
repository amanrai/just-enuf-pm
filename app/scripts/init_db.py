from app.db import create_schema
from app.scripts.seed_defaults import main as seed_defaults


def main() -> None:
    create_schema()
    seed_defaults()
    print("Initialized database and seed data")


if __name__ == "__main__":
    main()

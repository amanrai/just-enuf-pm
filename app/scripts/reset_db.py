from app.db import create_schema, delete_database_file
from app.scripts.seed_defaults import main as seed_defaults


def main() -> None:
    delete_database_file()
    create_schema()
    seed_defaults()
    print("Reset database and reapplied seed data")


if __name__ == "__main__":
    main()

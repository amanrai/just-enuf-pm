"""Write the application's OpenAPI contract snapshot to docs/openapi.json."""

import json
from pathlib import Path

from app.main import app


OUTPUT_PATH = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def main() -> None:
    OUTPUT_PATH.write_text(
        json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

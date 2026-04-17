#!/usr/bin/env python
from __future__ import annotations

import os
import sys
import subprocess
from pathlib import Path

from dotenv import load_dotenv


def resolve_venv_python(project_dir: Path) -> Path | None:
    candidates = [
        project_dir / ".venv" / "bin" / "python",
        project_dir / ".venv" / "Scripts" / "python.exe",
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def main() -> None:
    project_dir = Path(__file__).resolve().parent

    # Automatically reroute to the local virtual environment on Windows and Unix.
    venv_python = resolve_venv_python(project_dir)
    if venv_python and Path(sys.executable).resolve() != venv_python.resolve():
        sys.exit(subprocess.call([str(venv_python)] + sys.argv))

    if len(sys.argv) >= 2 and sys.argv[1] == "runserver" and len(sys.argv) == 2:
        sys.argv.append("127.0.0.1:3001")

    load_dotenv(project_dir / ".env")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

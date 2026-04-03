#!/usr/bin/env python
from __future__ import annotations

import os
import sys
import subprocess
from pathlib import Path

from dotenv import load_dotenv


def main() -> None:
    # Magic trick: Automatically reroute to the virtual environment Python
    venv_python = Path(__file__).resolve().parent / ".venv" / "Scripts" / "python.exe"
    if venv_python.exists() and ".venv" not in sys.executable:
        sys.exit(subprocess.call([str(venv_python)] + sys.argv))

    load_dotenv(Path(__file__).resolve().parent / ".env")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

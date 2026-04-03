import os
import django
from pathlib import Path
from dotenv import load_dotenv

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
load_dotenv(Path(__file__).resolve().parent / ".env")
django.setup()

from api.common import user_client

def list_profiles():
    client = user_client()
    try:
        profiles, _ = client.select('profiles', select='user_id,full_name')
        if not profiles:
            print("No profiles found.")
            return
        
        print(f"Found {len(profiles)} profiles:")
        for p in profiles:
            print(f"ID: {p['user_id']} | Name: {p['full_name']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_profiles()

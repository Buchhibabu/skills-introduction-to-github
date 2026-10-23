"""Shared ElevenLabs client for the build scripts.

The SDK reads ELEVENLABS_API_KEY from the environment; this loads it from the repo's
git-ignored .env.local (written by `elevenlabs onboard`). The key never lives in code.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# load before importing the SDK: it captures the environment variable at import time
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

from elevenlabs import ElevenLabs  # noqa: E402

client = ElevenLabs(api_key=os.environ.get("ELEVENLABS_API_KEY"))


def credits_used():
    """Credits consumed this billing period and the period's limit (for the production ledger)."""
    sub = client.user.subscription.get()
    return sub.character_count, sub.character_limit

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


def retry(fn, *args, tries=6, **kwargs):
    """Call the API, backing off on rate limits (429) and transient server errors."""
    import time
    from elevenlabs.core.api_error import ApiError

    for i in range(tries):
        try:
            return fn(*args, **kwargs)
        except ApiError as e:
            if e.status_code not in (429, 500, 502, 503, 504) or i == tries - 1:
                raise
            time.sleep(min(60, 4 * 2 ** i))


def credits_used():
    """Credits consumed this billing period and the period's limit (for the production ledger)."""
    sub = retry(client.user.subscription.get)
    return sub.character_count, sub.character_limit

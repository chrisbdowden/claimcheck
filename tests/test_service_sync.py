"""The API's copy of the engine (service/claimcheck_engine) must match src/ exactly."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from sync_service import out_of_date


def test_service_engine_copy_matches_src():
    stale = out_of_date()
    assert not stale, f"Run `python scripts/sync_service.py`; out of date: {stale}"

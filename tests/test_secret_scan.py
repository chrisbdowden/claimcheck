"""Demonstrate the content scan without storing a usable credential."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from scan_secrets import find_in_text, scan


def test_scanner_flags_synthetic_provider_keys():
    anthropic = "sk-ant-api03-" + ("a" * 24)
    xai = "xai-" + ("b" * 24)
    assert find_in_text(f"token={anthropic}")
    assert find_in_text(f"token={xai}")


def test_scanner_allows_approved_placeholders():
    example = (ROOT / ".streamlit" / "secrets.toml.example").read_text()
    assert "xai-..." in example
    assert "sk-ant-..." in example
    assert find_in_text(example) == []


def test_tracked_tree_has_no_credential_shaped_content():
    assert scan(ROOT) == []

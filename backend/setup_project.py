"""
Infrastructure Intelligence Platform — Project Setup Script

Creates all required directories. Safe to run multiple times (idempotent).
Does NOT download data or run pipeline steps.

Usage:
    python setup_project.py
"""

from pathlib import Path


DIRS = [
    # Data directories
    "data/raw",
    "data/interim",
    "data/processed",
    "data/processed/cost_components",
    "data/metadata",
    # Models (config files only — no trained ML weights)
    "models",
    # Outputs
    "outputs",
    # Source packages
    "src/acquisition",
    "src/preprocessing",
    "src/geospatial",
    "src/corridor",
    "src/site",
    "src/scoring",
    "src/inference",
    "src/ml",  # Reserved namespace, intentionally empty
    # Scripts
    "scripts",
    # Configs
    "configs",
    # Tests
    "tests",
    "tests/fixtures",
]

INIT_FILES = [
    "src/__init__.py",
    "src/acquisition/__init__.py",
    "src/preprocessing/__init__.py",
    "src/geospatial/__init__.py",
    "src/corridor/__init__.py",
    "src/site/__init__.py",
    "src/scoring/__init__.py",
    "src/inference/__init__.py",
    "src/ml/__init__.py",
    "tests/__init__.py",
]


def setup():
    root = Path(__file__).parent

    print("Creating directories...")
    for d in DIRS:
        path = root / d
        path.mkdir(parents=True, exist_ok=True)
        print(f"  [ok] {d}/")

    print("\nCreating __init__.py files...")
    for f in INIT_FILES:
        path = root / f
        if not path.exists():
            path.write_text('"""Infrastructure Intelligence Platform package."""\n')
            print(f"  [created] {f}")
        else:
            print(f"  [exists]  {f}")

    # Ensure data_sources.yaml exists (empty list)
    ds_path = root / "data/metadata/data_sources.yaml"
    if not ds_path.exists():
        ds_path.write_text("# Infrastructure Intelligence Platform — Dataset Provenance\n# Mandatory: every downloaded dataset must have an entry here.\n# Schema: dataset, source, download_url, license, date_downloaded, source_date, resolution, coverage, notes\n\n[]\n")
        print(f"\n  [created] data/metadata/data_sources.yaml (empty)")
    else:
        print(f"\n  [exists]  data/metadata/data_sources.yaml")

    print("\nSetup complete. Directory structure is ready.")


if __name__ == "__main__":
    setup()

"""
Infrastructure Intelligence Platform — Core Download Utilities

Provides:
  - download_http()           HTTP download with resume support
  - download_s3_no_auth()     AWS S3 download without credentials
  - download_s3_prefix()      AWS S3 prefix sync without credentials
  - append_data_source_record() Mandatory provenance tracking

HARD CONSTRAINT: This module NEVER silently falls back to sample/fake data.
Any download failure raises DataAcquisitionError immediately.
"""

from __future__ import annotations

import hashlib
import logging
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Optional

import requests
import yaml
from tqdm import tqdm

logger = logging.getLogger(__name__)

_DATA_SOURCES_PATH = Path(__file__).resolve().parents[2] / "data" / "metadata" / "data_sources.yaml"


class DataAcquisitionError(RuntimeError):
    """Raised when a mandatory dataset download fails.

    Per project hard constraints: never silently fall back to fake/sample data.
    Caller must inspect this error and stop the pipeline.
    """


def download_http(
    url: str,
    dest: Path,
    resume: bool = True,
    expected_sha256: Optional[str] = None,
    chunk_size: int = 1024 * 1024,
) -> Path:
    """Download a file via HTTP/HTTPS with optional resume and integrity check.

    Args:
        url: Full URL to download.
        dest: Destination file path.
        resume: If True and dest partially exists, send Range header to resume.
        expected_sha256: Hex digest to verify after download. If None, skipped.
        chunk_size: Stream chunk size in bytes.

    Returns:
        Path to the downloaded file.

    Raises:
        DataAcquisitionError: On any HTTP error, connection failure, or hash mismatch.
    """
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    existing_bytes = dest.stat().st_size if (resume and dest.exists()) else 0
    headers = {
        "User-Agent": "InfrastructureIntelligencePlatform/1.0 (contact: demo@example.com) requests/2.34"
    }
    if existing_bytes > 0:
        headers["Range"] = f"bytes={existing_bytes}-"

    try:
        response = requests.get(url, headers=headers, stream=True, timeout=60)
    except requests.RequestException as exc:
        raise DataAcquisitionError(
            f"HTTP connection failed for {url}: {exc}"
        ) from exc

    if response.status_code == 416:
        # Range not satisfiable — file already fully downloaded
        logger.info("File already complete (HTTP 416 on resume): %s", dest)
        return dest

    if response.status_code not in (200, 206):
        raise DataAcquisitionError(
            f"HTTP {response.status_code} downloading {url} → {dest}"
        )

    total_size = int(response.headers.get("content-length", 0))
    if existing_bytes > 0 and response.status_code == 206:
        total_size += existing_bytes
        logger.info("Resuming download from byte %d: %s", existing_bytes, url)

    mode = "ab" if (existing_bytes > 0 and response.status_code == 206) else "wb"

    with open(dest, mode) as fh, tqdm(
        total=total_size if total_size > 0 else None,
        initial=existing_bytes,
        unit="B",
        unit_scale=True,
        unit_divisor=1024,
        desc=dest.name,
        file=sys.stdout,
    ) as pbar:
        for chunk in response.iter_content(chunk_size=chunk_size):
            if chunk:
                fh.write(chunk)
                pbar.update(len(chunk))

    if expected_sha256:
        actual = _sha256(dest)
        if actual != expected_sha256.lower():
            dest.unlink(missing_ok=True)
            raise DataAcquisitionError(
                f"SHA256 mismatch for {dest.name}: "
                f"expected {expected_sha256}, got {actual}"
            )
        logger.info("SHA256 verified: %s", dest.name)

    return dest


def download_s3_no_auth(
    s3_uri: str,
    dest: Path,
    region: str = "eu-central-1",
) -> Path:
    """Download a single object from a public S3 bucket (no credentials required).

    Args:
        s3_uri: Full S3 URI, e.g. s3://copernicus-dem-30m/Copernicus_DSM.../file.tif
        dest: Destination file path.
        region: AWS region of the bucket.

    Returns:
        Path to the downloaded file.

    Raises:
        DataAcquisitionError: If aws CLI is not found or returns non-zero exit code.
    """
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "awscli", "s3", "cp",
        "--no-sign-request",
        "--region", region,
        s3_uri,
        str(dest),
    ]

    logger.info("S3 download: %s → %s", s3_uri, dest)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise DataAcquisitionError(
            f"aws cli not found. Is it installed and on PATH? {exc}"
        ) from exc

    if result.returncode != 0:
        raise DataAcquisitionError(
            f"aws s3 cp failed (exit {result.returncode}):\n"
            f"  URI: {s3_uri}\n"
            f"  stderr: {result.stderr.strip()}\n"
            f"\nThis is a mandatory dataset. Do not substitute fake data."
        )

    return dest


def download_s3_prefix(
    s3_prefix: str,
    dest_dir: Path,
    region: str = "eu-central-1",
    include: Optional[str] = None,
    exclude: Optional[str] = None,
) -> Path:
    """Sync a prefix from a public S3 bucket to a local directory.

    Args:
        s3_prefix: S3 prefix to sync, e.g. s3://esa-worldcover/v200/2021/map/
        dest_dir: Local directory to sync into.
        region: AWS region of the bucket.
        include: Optional --include glob pattern.
        exclude: Optional --exclude glob pattern (applied before include).

    Returns:
        Path to the destination directory.

    Raises:
        DataAcquisitionError: On aws CLI failure.
    """
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "awscli", "s3", "sync",
        "--no-sign-request",
        "--region", region,
        s3_prefix,
        str(dest_dir),
    ]
    if exclude:
        cmd += ["--exclude", exclude]
    if include:
        cmd += ["--include", include]

    logger.info("S3 sync: %s → %s", s3_prefix, dest_dir)
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise DataAcquisitionError(
            f"aws s3 sync failed (exit {result.returncode}):\n"
            f"  Prefix: {s3_prefix}\n"
            f"  stderr: {result.stderr.strip()}\n"
            f"\nThis is a mandatory dataset. Do not substitute fake data."
        )

    return dest_dir


def list_s3_prefix(
    s3_prefix: str,
    region: str = "eu-central-1",
) -> list[str]:
    """List objects under an S3 prefix (no auth). Returns list of object keys."""
    cmd = [
        sys.executable, "-m", "awscli", "s3", "ls",
        "--no-sign-request",
        "--region", region,
        s3_prefix,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise DataAcquisitionError(
            f"aws s3 ls failed (exit {result.returncode}) for {s3_prefix}:\n"
            f"  {result.stderr.strip()}"
        )
    lines = result.stdout.strip().splitlines()
    # Each line is: "YYYY-MM-DD HH:MM:SS    SIZE  FILENAME"
    keys = [line.split()[-1] for line in lines if line.strip()]
    return keys


def append_data_source_record(entry: dict) -> None:
    """Append a dataset provenance record to data/metadata/data_sources.yaml.

    Args:
        entry: Dict with keys: dataset, source, download_url, license,
               date_downloaded, source_date, resolution, coverage, notes.

    Raises:
        ValueError: If required keys are missing.
    """
    required = {"dataset", "source", "download_url", "license",
                "date_downloaded", "source_date", "resolution", "coverage"}
    missing = required - set(entry.keys())
    if missing:
        raise ValueError(f"data_sources.yaml entry missing keys: {missing}")

    if "notes" not in entry:
        entry["notes"] = ""

    _DATA_SOURCES_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing = []
    if _DATA_SOURCES_PATH.exists():
        with open(_DATA_SOURCES_PATH, encoding="utf-8") as f:
            data = yaml.safe_load(f)
            if isinstance(data, list):
                existing = data

    existing.append(entry)

    with open(_DATA_SOURCES_PATH, "w", encoding="utf-8") as f:
        yaml.dump(existing, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    logger.info("Provenance recorded: %s", entry["dataset"])


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def today_iso() -> str:
    return date.today().isoformat()

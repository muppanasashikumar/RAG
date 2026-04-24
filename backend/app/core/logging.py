"""Logging configuration.

Sets up structured-ish logging with a uniform format.  Kept intentionally
dependency-free so it works even when optional libs are absent.
"""

from __future__ import annotations

import logging
import sys

_LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
_LOG_DATEFMT = "%Y-%m-%dT%H:%M:%S%z"


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if root.handlers:
        # Already configured (e.g. by uvicorn --reload workers).
        for handler in root.handlers:
            handler.setLevel(level)
        root.setLevel(level)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(fmt=_LOG_FORMAT, datefmt=_LOG_DATEFMT))
    root.addHandler(handler)
    root.setLevel(level)

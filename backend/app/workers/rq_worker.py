from __future__ import annotations

import asyncio

from rq import SimpleWorker

from app.core.logging import configure_logging
from app.core.dependencies import get_ingestion_queue, get_redis_client
from app.infrastructure.mongo import initialize_collections


def run() -> None:
    configure_logging()
    asyncio.run(initialize_collections())
    connection = get_redis_client()
    queue = get_ingestion_queue()
    # Use SimpleWorker to execute jobs in-process. On macOS, forked RQ work-horses
    # can crash with native ML libraries (signal 11) during ingestion.
    worker = SimpleWorker([queue.name], connection=connection)
    worker.work()


if __name__ == "__main__":
    run()

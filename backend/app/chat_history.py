from __future__ import annotations

import sqlite3
import json
from pathlib import Path
from threading import Lock
from typing import Any


class ChatHistoryStore:
    def __init__(self, db_file: Path) -> None:
        self.db_file = db_file
        self.db_file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_file))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    citations_json TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON chat_messages(chat_id, created_at);
                """
            )
            columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(chat_messages)").fetchall()
            }
            if "citations_json" not in columns:
                conn.execute(
                    "ALTER TABLE chat_messages ADD COLUMN citations_json TEXT"
                )

    def save_conversation_turn(
        self,
        *,
        chat_id: str,
        question: str,
        answer: str,
        citations: list[dict[str, Any]] | None,
        source: str,
        updated_at: str,
    ) -> dict[str, Any]:
        title = question.strip()[:96] or "Untitled chat"
        with self._lock:
            with self._connect() as conn:
                existing = conn.execute(
                    "SELECT id FROM chats WHERE id = ?",
                    (chat_id,),
                ).fetchone()
                if existing is None:
                    conn.execute(
                        """
                        INSERT INTO chats (id, title, source, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (chat_id, title, source, "ready", updated_at, updated_at),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE chats
                        SET title = ?, source = ?, status = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (title, source, "ready", updated_at, chat_id),
                    )

                conn.executemany(
                    """
                    INSERT INTO chat_messages (chat_id, role, content, citations_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        (chat_id, "user", question, None, updated_at),
                        (
                            chat_id,
                            "assistant",
                            answer,
                            json.dumps(citations or []),
                            updated_at,
                        ),
                    ],
                )
                message_count = conn.execute(
                    "SELECT COUNT(*) as c FROM chat_messages WHERE chat_id = ?",
                    (chat_id,),
                ).fetchone()

        return {
            "id": chat_id,
            "title": title,
            "source": source,
            "updated_at": updated_at,
            "status": "ready",
            "messages": int(message_count["c"]) if message_count else 0,
        }

    def list_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT c.id, c.title, c.source, c.status, c.updated_at, COUNT(m.id) as messages
                FROM chats c
                LEFT JOIN chat_messages m ON m.chat_id = c.id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "source": row["source"],
                "updated_at": row["updated_at"],
                "status": row["status"],
                "messages": int(row["messages"] or 0),
            }
            for row in rows
        ]

    def get_chat_messages(self, chat_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT role, content, citations_json, created_at
                FROM chat_messages
                WHERE chat_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (chat_id,),
            ).fetchall()
        return [
            {
                "role": str(row["role"]),
                "content": str(row["content"]),
                "citations": json.loads(row["citations_json"])
                if row["citations_json"]
                else [],
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ]

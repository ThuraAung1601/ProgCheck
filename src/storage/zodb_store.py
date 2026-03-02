from __future__ import annotations

from datetime import datetime, timezone
import importlib
from pathlib import Path
from threading import Lock
from typing import Any

import transaction


class ZODBStore:
    def __init__(self, db_path: str = "data/zodb.fs"):
        try:
            oobtree_module = importlib.import_module("BTrees.OOBTree")
            zodb_module = importlib.import_module("ZODB")
            filestorage_module = importlib.import_module("ZODB.FileStorage")
        except Exception as exc:
            raise RuntimeError(
                "ZODB dependencies are missing. Install with: pip install ZODB BTrees"
            ) from exc

        OOBTree = getattr(oobtree_module, "OOBTree")
        DB = getattr(zodb_module, "DB")
        FileStorage = getattr(filestorage_module, "FileStorage")

        self._OOBTree = OOBTree
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._storage = FileStorage(str(self.db_path))
        self._db = DB(self._storage)
        self._conn = self._db.open()
        self._root = self._conn.root()
        self._lock = Lock()
        self._initialize()

    def _initialize(self) -> None:
        with self._lock:
            if "records" not in self._root:
                self._root["records"] = self._OOBTree()
            if "counters" not in self._root:
                self._root["counters"] = self._OOBTree()
            if "entities" not in self._root:
                self._root["entities"] = self._OOBTree()

            records = self._root["records"]
            counters = self._root["counters"]
            entities = self._root["entities"]
            for bucket in ("teacher_prepare", "student_analyze", "autocorrect"):
                if bucket not in records:
                    records[bucket] = self._OOBTree()
                if bucket not in counters:
                    counters[bucket] = 0
            for entity_bucket in (
                "users",
                "sessions",
                "classrooms",
                "classroom_members",
                "labs",
                "lab_questions",
                "submissions",
            ):
                if entity_bucket not in entities:
                    entities[entity_bucket] = self._OOBTree()
            transaction.commit()

    def save_record(self, bucket: str, payload: dict[str, Any]) -> str:
        with self._lock:
            records = self._root["records"]
            counters = self._root["counters"]

            if bucket not in records:
                records[bucket] = self._OOBTree()
            if bucket not in counters:
                counters[bucket] = 0

            counters[bucket] = int(counters[bucket]) + 1
            record_id = f"{bucket}-{counters[bucket]}"

            records[bucket][record_id] = {
                "id": record_id,
                "bucket": bucket,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "payload": payload,
            }
            transaction.commit()
            return record_id

    def get_record(self, bucket: str, record_id: str) -> dict[str, Any] | None:
        with self._lock:
            records = self._root["records"]
            if bucket not in records:
                return None
            value = records[bucket].get(record_id)
            return dict(value) if value else None

    def list_records(self, bucket: str, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            records = self._root["records"]
            if bucket not in records:
                return []
            items = list(records[bucket].items())
            items.sort(key=lambda item: item[0], reverse=True)
            return [dict(value) for _, value in items[:limit]]

    def close(self) -> None:
        with self._lock:
            transaction.commit()
            self._conn.close()
            self._db.close()
            self._storage.close()

    def put_item(self, bucket: str, key: str, payload: dict[str, Any]) -> None:
        with self._lock:
            entities = self._root["entities"]
            if bucket not in entities:
                entities[bucket] = self._OOBTree()
            entities[bucket][key] = payload
            transaction.commit()

    def get_item(self, bucket: str, key: str) -> dict[str, Any] | None:
        with self._lock:
            entities = self._root["entities"]
            if bucket not in entities:
                return None
            value = entities[bucket].get(key)
            return dict(value) if value else None

    def delete_item(self, bucket: str, key: str) -> bool:
        with self._lock:
            entities = self._root["entities"]
            if bucket not in entities:
                return False
            if key not in entities[bucket]:
                return False
            del entities[bucket][key]
            transaction.commit()
            return True

    def list_items(self, bucket: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            entities = self._root["entities"]
            if bucket not in entities:
                return []
            items = list(entities[bucket].items())
            items.sort(key=lambda item: str(item[0]))
            return [dict(value) for _, value in items[:limit]]


_STORE: ZODBStore | None = None


def get_store(db_path: str = "data/zodb.fs") -> ZODBStore:
    global _STORE
    if _STORE is None:
        _STORE = ZODBStore(db_path=db_path)
    return _STORE

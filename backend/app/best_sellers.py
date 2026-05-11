import json
import os
from threading import Lock

from flask import current_app
from sqlalchemy import text

from app import db


_LOCK = Lock()


def _storage_path():
    configured = current_app.config.get("BEST_SELLERS_FILE")
    if configured:
        return configured
    return os.path.join(current_app.root_path, "best_sellers.json")


def _normalize_ids(product_ids):
    normalized = []
    seen = set()
    for value in product_ids or []:
        try:
            product_id = int(value)
        except Exception:
            continue
        if product_id in seen:
            continue
        seen.add(product_id)
        normalized.append(product_id)
    return normalized


def _read_legacy_json_ids():
    path = _storage_path()
    if not os.path.exists(path):
        return []

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        return []

    ids = data.get("product_ids", []) if isinstance(data, dict) else data
    return _normalize_ids(ids)


def _ensure_table_and_migrate_legacy_json():
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS best_seller_product (
            product_id INTEGER PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    count = db.session.execute(
        text("SELECT COUNT(*) FROM best_seller_product")
    ).scalar() or 0

    if count == 0:
        legacy_ids = _read_legacy_json_ids()
        for idx, product_id in enumerate(legacy_ids):
            db.session.execute(
                text("""
                    INSERT INTO best_seller_product (product_id, sort_order)
                    VALUES (:product_id, :sort_order)
                """),
                {"product_id": product_id, "sort_order": idx},
            )

    db.session.commit()


def get_best_seller_ids():
    try:
        _ensure_table_and_migrate_legacy_json()
        rows = db.session.execute(
            text("""
                SELECT product_id
                FROM best_seller_product
                ORDER BY sort_order ASC, created_at ASC, product_id ASC
            """)
        ).fetchall()
        return _normalize_ids([row[0] for row in rows])
    except Exception:
        db.session.rollback()
        raise


def set_best_seller_ids(product_ids):
    normalized = _normalize_ids(product_ids)

    with _LOCK:
        try:
            _ensure_table_and_migrate_legacy_json()
            db.session.execute(text("DELETE FROM best_seller_product"))
            for idx, product_id in enumerate(normalized):
                db.session.execute(
                    text("""
                        INSERT INTO best_seller_product (product_id, sort_order)
                        VALUES (:product_id, :sort_order)
                    """),
                    {"product_id": product_id, "sort_order": idx},
                )
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

    return normalized


def set_product_best_seller(product_id, enabled):
    product_id = int(product_id)
    current = get_best_seller_ids()
    if enabled:
        if product_id not in current:
            current.append(product_id)
    else:
        current = [item for item in current if item != product_id]
    return set_best_seller_ids(current)


def attach_best_seller_flags(products):
    best_ids = get_best_seller_ids()
    product_id_set = {product.id for product in products}
    visible_best_ids = [product_id for product_id in best_ids if product_id in product_id_set]
    rank_by_id = {product_id: idx for idx, product_id in enumerate(visible_best_ids)}
    best_set = set(best_ids)

    serialized = []
    for product in products:
        row = product.serialize()
        rank = rank_by_id.get(product.id)
        row["is_best_seller"] = product.id in best_set
        row["best_seller_rank"] = rank
        row["is_home_featured"] = rank is not None and rank < 12
        serialized.append(row)
    return serialized

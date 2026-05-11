import json
import os
from threading import Lock

from flask import current_app


_LOCK = Lock()


def _storage_path():
    configured = current_app.config.get("BEST_SELLERS_FILE")
    if configured:
        return configured
    return os.path.join(current_app.root_path, "best_sellers.json")


def get_best_seller_ids():
    path = _storage_path()
    if not os.path.exists(path):
        return []

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        return []

    ids = data.get("product_ids", []) if isinstance(data, dict) else data
    normalized = []
    seen = set()
    for value in ids or []:
        try:
            product_id = int(value)
        except Exception:
            continue
        if product_id in seen:
            continue
        seen.add(product_id)
        normalized.append(product_id)
    return normalized


def set_best_seller_ids(product_ids):
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

    path = _storage_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with _LOCK:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"product_ids": normalized}, fh, ensure_ascii=False, indent=2)
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

import json
import os
from threading import Lock

from flask import current_app
from sqlalchemy import inspect, text

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


def _table_columns():
    try:
        return {column["name"] for column in inspect(db.engine).get_columns("best_seller_product")}
    except Exception:
        return set()


def _ensure_column(name, ddl_type="INTEGER"):
    if name in _table_columns():
        return
    dialect = db.engine.dialect.name
    if dialect == "postgresql":
        db.session.execute(text(f"ALTER TABLE best_seller_product ADD COLUMN IF NOT EXISTS {name} {ddl_type}"))
        return
    db.session.execute(text(f"ALTER TABLE best_seller_product ADD COLUMN {name} {ddl_type}"))


def _ensure_table_and_migrate_legacy_data():
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS best_seller_product (
            product_id INTEGER PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0,
            best_seller_order INTEGER,
            home_featured_order INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    _ensure_column("best_seller_order", "INTEGER")
    _ensure_column("home_featured_order", "INTEGER")

    count = db.session.execute(text("SELECT COUNT(*) FROM best_seller_product")).scalar() or 0

    if count == 0:
        legacy_ids = _read_legacy_json_ids()
        for idx, product_id in enumerate(legacy_ids):
            db.session.execute(
                text("""
                    INSERT INTO best_seller_product (
                        product_id,
                        sort_order,
                        best_seller_order,
                        home_featured_order
                    )
                    VALUES (
                        :product_id,
                        :sort_order,
                        :best_seller_order,
                        :home_featured_order
                    )
                """),
                {
                    "product_id": product_id,
                    "sort_order": idx,
                    "best_seller_order": idx,
                    "home_featured_order": idx if idx < 12 else None,
                },
            )
    else:
        missing_flags = db.session.execute(text("""
            SELECT COUNT(*)
            FROM best_seller_product
            WHERE best_seller_order IS NOT NULL
               OR home_featured_order IS NOT NULL
        """)).scalar() or 0

        if missing_flags == 0:
            db.session.execute(text("""
                UPDATE best_seller_product
                SET best_seller_order = sort_order,
                    home_featured_order = CASE WHEN sort_order < 12 THEN sort_order ELSE NULL END
            """))

    _compact_order("best_seller_order")
    _compact_order("home_featured_order")
    db.session.commit()


def _ordered_ids(column):
    _ensure_table_and_migrate_legacy_data()
    rows = db.session.execute(
        text(f"""
            SELECT product_id
            FROM best_seller_product
            WHERE {column} IS NOT NULL
            ORDER BY {column} ASC, created_at ASC, product_id ASC
        """)
    ).fetchall()
    return _normalize_ids([row[0] for row in rows])


def _compact_order(column):
    rows = db.session.execute(
        text(f"""
            SELECT product_id
            FROM best_seller_product
            WHERE {column} IS NOT NULL
            ORDER BY {column} ASC, created_at ASC, product_id ASC
        """)
    ).fetchall()
    for idx, row in enumerate(rows):
        db.session.execute(
            text(f"UPDATE best_seller_product SET {column} = :sort_order WHERE product_id = :product_id"),
            {"sort_order": idx, "product_id": row[0]},
        )


def _set_product_flag(product_id, enabled, column):
    product_id = int(product_id)
    with _LOCK:
        try:
            _ensure_table_and_migrate_legacy_data()
            current = db.session.execute(
                text("SELECT product_id FROM best_seller_product WHERE product_id = :product_id"),
                {"product_id": product_id},
            ).first()

            if enabled:
                if column == "home_featured_order":
                    home_count = db.session.execute(
                        text("""
                            SELECT COUNT(*)
                            FROM best_seller_product
                            WHERE home_featured_order IS NOT NULL
                              AND product_id != :product_id
                        """),
                        {"product_id": product_id},
                    ).scalar() or 0
                    if home_count >= 12:
                        raise ValueError("Solo podés seleccionar hasta 12 productos para Inicio")

                next_order = db.session.execute(
                    text(f"SELECT COALESCE(MAX({column}), -1) + 1 FROM best_seller_product WHERE {column} IS NOT NULL")
                ).scalar() or 0

                if current:
                    db.session.execute(
                        text(f"UPDATE best_seller_product SET {column} = :sort_order WHERE product_id = :product_id"),
                        {"sort_order": next_order, "product_id": product_id},
                    )
                else:
                    db.session.execute(
                        text(f"""
                            INSERT INTO best_seller_product (product_id, sort_order, {column})
                            VALUES (:product_id, :sort_order, :flag_order)
                        """),
                        {"product_id": product_id, "sort_order": next_order, "flag_order": next_order},
                    )
            else:
                db.session.execute(
                    text(f"UPDATE best_seller_product SET {column} = NULL WHERE product_id = :product_id"),
                    {"product_id": product_id},
                )
                db.session.execute(text("""
                    DELETE FROM best_seller_product
                    WHERE best_seller_order IS NULL
                      AND home_featured_order IS NULL
                """))

            _compact_order(column)
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise


def get_best_seller_ids():
    try:
        return _ordered_ids("best_seller_order")
    except Exception:
        db.session.rollback()
        raise


def get_home_featured_ids():
    try:
        return _ordered_ids("home_featured_order")
    except Exception:
        db.session.rollback()
        raise


def set_product_best_seller(product_id, enabled):
    _set_product_flag(product_id, enabled, "best_seller_order")
    return get_best_seller_ids()


def set_product_home_featured(product_id, enabled):
    _set_product_flag(product_id, enabled, "home_featured_order")
    return get_home_featured_ids()


def attach_best_seller_flags(products):
    try:
        best_ids = get_best_seller_ids()
        home_ids = get_home_featured_ids()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.exception("No se pudieron cargar flags de Mas Vendidos/Inicio: %s", exc)
        serialized = []
        for product in products:
            row = product.serialize()
            row["is_best_seller"] = False
            row["best_seller_rank"] = None
            row["is_home_featured"] = False
            row["home_featured_rank"] = None
            serialized.append(row)
        return serialized

    product_id_set = {product.id for product in products}
    visible_best_ids = [product_id for product_id in best_ids if product_id in product_id_set]
    visible_home_ids = [product_id for product_id in home_ids if product_id in product_id_set]
    best_rank_by_id = {product_id: idx for idx, product_id in enumerate(visible_best_ids)}
    home_rank_by_id = {product_id: idx for idx, product_id in enumerate(visible_home_ids)}
    best_set = set(best_ids)
    home_set = set(home_ids)

    serialized = []
    for product in products:
        row = product.serialize()
        best_rank = best_rank_by_id.get(product.id)
        home_rank = home_rank_by_id.get(product.id)
        row["is_best_seller"] = product.id in best_set
        row["best_seller_rank"] = best_rank
        row["is_home_featured"] = product.id in home_set
        row["home_featured_rank"] = home_rank
        serialized.append(row)
    return serialized

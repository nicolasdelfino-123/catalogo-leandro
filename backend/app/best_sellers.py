from threading import Lock

from flask import current_app
from sqlalchemy import text

from app import db


_LOCK = Lock()


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


def _read_flags_fast():
    try:
        rows = db.session.execute(text("""
            SELECT product_id, best_seller_order, home_featured_order
            FROM best_seller_product
            WHERE best_seller_order IS NOT NULL
               OR home_featured_order IS NOT NULL
            ORDER BY product_id ASC
        """)).fetchall()
        best_rows = [
            (int(row[0]), int(row[1]))
            for row in rows
            if row[1] is not None
        ]
        home_rows = [
            (int(row[0]), int(row[2]))
            for row in rows
            if row[2] is not None
        ]
        best_ids = [product_id for product_id, _ in sorted(best_rows, key=lambda item: (item[1], item[0]))]
        home_ids = [product_id for product_id, _ in sorted(home_rows, key=lambda item: (item[1], item[0]))]
        return _normalize_ids(best_ids), _normalize_ids(home_ids)
    except Exception as exc:
        db.session.rollback()
        message = str(exc).lower()
        if "best_seller_order" not in message and "home_featured_order" not in message:
            current_app.logger.warning("No se pudieron leer flags nuevos de productos destacados: %s", exc)
            return [], []

    try:
        rows = db.session.execute(text("""
            SELECT product_id, sort_order
            FROM best_seller_product
            ORDER BY sort_order ASC, product_id ASC
        """)).fetchall()
        legacy_ids = _normalize_ids([row[0] for row in rows])
        return legacy_ids, legacy_ids[:12]
    except Exception as exc:
        db.session.rollback()
        current_app.logger.warning("No se pudieron leer flags legacy de productos destacados: %s", exc)
        return [], []


def _ensure_table_for_write():
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS best_seller_product (
            product_id INTEGER PRIMARY KEY,
            sort_order INTEGER DEFAULT 0,
            best_seller_order INTEGER,
            home_featured_order INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    dialect = db.engine.dialect.name
    if dialect == "postgresql":
        db.session.execute(text("ALTER TABLE best_seller_product ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0"))
        db.session.execute(text("ALTER TABLE best_seller_product ADD COLUMN IF NOT EXISTS best_seller_order INTEGER"))
        db.session.execute(text("ALTER TABLE best_seller_product ADD COLUMN IF NOT EXISTS home_featured_order INTEGER"))
        db.session.execute(text("ALTER TABLE best_seller_product ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))
    else:
        for column, ddl in (
            ("sort_order", "INTEGER DEFAULT 0"),
            ("best_seller_order", "INTEGER"),
            ("home_featured_order", "INTEGER"),
            ("created_at", "TIMESTAMP"),
        ):
            try:
                db.session.execute(text(f"ALTER TABLE best_seller_product ADD COLUMN {column} {ddl}"))
            except Exception:
                db.session.rollback()

    db.session.execute(text("""
        UPDATE best_seller_product
        SET best_seller_order = sort_order
        WHERE best_seller_order IS NULL
          AND sort_order IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM best_seller_product
              WHERE best_seller_order IS NOT NULL
          )
    """))
    db.session.execute(text("""
        UPDATE best_seller_product
        SET home_featured_order = sort_order
        WHERE home_featured_order IS NULL
          AND sort_order IS NOT NULL
          AND sort_order < 12
          AND NOT EXISTS (
              SELECT 1
              FROM best_seller_product
              WHERE home_featured_order IS NOT NULL
          )
    """))
    db.session.commit()


def _ordered_ids(column):
    rows = db.session.execute(
        text(f"""
            SELECT product_id
            FROM best_seller_product
            WHERE {column} IS NOT NULL
            ORDER BY {column} ASC, product_id ASC
        """)
    ).fetchall()
    return _normalize_ids([row[0] for row in rows])


def _compact_order(column):
    rows = db.session.execute(
        text(f"""
            SELECT product_id
            FROM best_seller_product
            WHERE {column} IS NOT NULL
            ORDER BY {column} ASC, product_id ASC
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
            _ensure_table_for_write()
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
    best_ids, _ = _read_flags_fast()
    return best_ids


def get_home_featured_ids():
    _, home_ids = _read_flags_fast()
    return home_ids


def set_product_best_seller(product_id, enabled):
    _set_product_flag(product_id, enabled, "best_seller_order")
    return get_best_seller_ids()


def set_product_home_featured(product_id, enabled):
    _set_product_flag(product_id, enabled, "home_featured_order")
    return get_home_featured_ids()


def attach_best_seller_flags(products):
    best_ids, home_ids = _read_flags_fast()
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

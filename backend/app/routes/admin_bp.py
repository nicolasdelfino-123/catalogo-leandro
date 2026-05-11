"""
Panel de administración para gestionar productos
Este archivo contendrá las rutas administrativas para CRUD de productos
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from sqlalchemy import func
from app.models import Product, Category, User,ProductImage,now_cba_naive
from flask import current_app, send_from_directory, url_for
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps # pip install pillow
from flask import url_for
# backend/app/routes/admin_bp.py
from flask import Blueprint, request, jsonify, current_app, url_for
import os, io, hashlib, uuid
from app.models import Order, OrderItem  # asegurate que esté arriba también
from flask import redirect
from app.best_sellers import attach_best_seller_flags, set_product_best_seller, set_product_home_featured, can_add_home_featured




admin_bp = Blueprint('admin', __name__)

# Catálogo de categorías esperado por el frontend actual.
# Mantener IDs estables evita romper FK y filtros ya existentes.
CATEGORY_ID_TO_NAME = {
    1: "Perfumes masculinos",
    2: "Femeninos",
    3: "Unisex",
    4: "Cremas",
    5: "Body splash victoria secret",
    6: "Perfumes",  # compatibilidad legacy
    7: "Perfumes de Diseñador",
    8: "Mas Vendidos",
}

def _ensure_category_exists(category_id: int):
    category_id = int(category_id)
    category = Category.query.get(category_id)
    if category:
        return category

    # Si no existe el ID exacto, lo creamos con nombre estable para evitar FK errors.
    name = CATEGORY_ID_TO_NAME.get(category_id, f"Categoría {category_id}")
    by_name = Category.query.filter_by(name=name).first()
    if by_name:
        return by_name

    category = Category(
        id=category_id,
        name=name,
        description=f"Categoría auto-creada ({name})"
    )
    db.session.add(category)
    db.session.flush()
    return category

# === Helpers de sabores/stock por sabor ===
def _normalize_catalog(catalog):
    norm = []
    for x in (catalog or []):
        if isinstance(x, dict):
            name = str(x.get('name','')).strip()
            active = bool(x.get('active', True))
            try:
                stock = int(x.get('stock', 0))
            except Exception:
                stock = 0
        else:
            # por si llega string suelto
            name, active, stock = str(x).strip(), True, 0
        norm.append({'name': name, 'active': active, 'stock': max(stock, 0)})
    return norm

def _sum_active_stock(catalog):
    return sum(int(f.get('stock', 0)) for f in (catalog or []) if f.get('active'))

def _normalize_volume_options(rows):
    normalized = []
    for row in (rows or []):
        if not isinstance(row, dict):
            continue

        try:
            ml = int(float(row.get('ml')))
        except Exception:
            continue
        if ml <= 0:
            continue

        price = None
        raw_price = row.get('price')
        if raw_price not in ("", None):
            try:
                val = float(raw_price)
                price = val if val > 0 else None
            except Exception:
                price = None

        price_wholesale = None
        raw_wh = row.get('price_wholesale')
        if raw_wh not in ("", None):
            try:
                val = float(raw_wh)
                price_wholesale = val if val > 0 else None
            except Exception:
                price_wholesale = None

        stock = 0
        raw_stock = row.get('stock')
        if raw_stock not in ("", None):
            try:
                stock = max(0, int(float(raw_stock)))
            except Exception:
                stock = 0

        normalized.append({
            'ml': ml,
            'price': price,
            'price_wholesale': price_wholesale,
            'stock': stock,
        })

    # evita duplicados por ml (último valor gana)
    by_ml = {}
    for item in normalized:
        by_ml[item['ml']] = item
    return [by_ml[k] for k in sorted(by_ml.keys())]

def _sum_volume_stock(rows):
    return sum(max(0, int(x.get('stock', 0) or 0)) for x in (rows or []))

# Middleware para verificar que el usuario sea admin
def admin_required():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    return user and user.is_admin

# =======================
#       PRODUCTOS
# =======================

@admin_bp.route('/products', methods=['POST'])
@jwt_required()
def create_product():
    if not admin_required():
        return jsonify({'error': 'Acceso denegado.'}), 403
    try:
        data = request.get_json() or {}

        # stock puede venir calculado si flavor_stock_mode = true
        required = ['name', 'price', 'category_id']
        for r in required:
            if r not in data:
                return jsonify({'error': f'Falta el campo requerido: {r}'}), 400

        # ===== precio mayorista opcional =====
        price_wholesale = None
        if data.get('price_wholesale') not in ("", None):
            try:
                price_wholesale = float(data['price_wholesale'])
            except:
                price_wholesale = None

        # ===== soporte de stock por sabor =====
        catalog = _normalize_catalog(data.get('flavor_catalog'))
        flavor_stock_mode = bool(data.get('flavor_stock_mode', False))
        flavor_enabled = bool(data.get('flavor_enabled', False))
        active_flavors = [f['name'] for f in catalog if f.get('active')] if catalog else (data.get('flavors') or [])

        volume_ml = None
        if data.get('volume_ml') not in ("", None):
            try:
                volume_ml = max(0, int(float(data.get('volume_ml'))))
            except Exception:
                volume_ml = None
        volume_options = _normalize_volume_options(data.get('volume_options'))

        # stock total coherente
        if flavor_stock_mode:
            computed_stock = _sum_active_stock(catalog)
        elif len(volume_options) > 0:
            computed_stock = _sum_volume_stock(volume_options)
        else:
            try:
                computed_stock = int(data.get('stock', 0))
            except Exception:
                computed_stock = 0

        safe_category = _ensure_category_exists(int(data['category_id']))
        normalized_name = str(data.get('name') or '').strip()

        existing_product = Product.query.filter(
            Product.category_id == safe_category.id,
            func.lower(func.trim(Product.name)) == normalized_name.lower()
        ).order_by(Product.id.desc()).first()

        if existing_product:
            if 'is_best_seller' in data:
                set_product_best_seller(existing_product.id, bool(data.get('is_best_seller')))
            if 'is_home_featured' in data:
                try:
                    set_product_home_featured(existing_product.id, bool(data.get('is_home_featured')))
                except ValueError as e:
                    return jsonify({'error': str(e)}), 400
            return jsonify({
                'message': 'Producto ya existente',
                'product': existing_product.serialize(),
                'duplicate_prevented': True,
            }), 200

        if bool(data.get('is_home_featured')) and not can_add_home_featured():
            return jsonify({'error': 'Solo podés seleccionar hasta 12 productos para Inicio'}), 400

        product = Product(
            name=normalized_name,
            description=data.get('description', ''),
            short_description=data.get('short_description', ''),
            price=float(data['price']),
            price_wholesale=price_wholesale,   # ✅ AHORA SE GUARDA
            stock=computed_stock,
            category_id=safe_category.id,
            image_url=data.get('image_url', ''),
            brand=data.get('brand', ''),
            is_active=bool(data.get('is_active', True)),

            # sabores visibles (strings)
            flavors=active_flavors,
            flavor_enabled=flavor_enabled,

            # catálogo completo + modo
            flavor_catalog=catalog,
            flavor_stock_mode=flavor_stock_mode,

            # puffs opcional (no molesta si queda)
            puffs=(int(data['puffs']) if str(data.get('puffs','')).strip().isdigit() else None),
            volume_ml=volume_ml,
            volume_options=volume_options,

            created_at=now_cba_naive(),
        )
        db.session.add(product)
        db.session.commit()
        if 'is_best_seller' in data:
            set_product_best_seller(product.id, bool(data.get('is_best_seller')))
        if 'is_home_featured' in data:
            try:
                set_product_home_featured(product.id, bool(data.get('is_home_featured')))
            except ValueError as e:
                return jsonify({'error': str(e)}), 400
        return jsonify({'message': 'Producto creado exitosamente', 'product': product.serialize()}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error al crear producto: {str(e)}'}), 500


@admin_bp.route('/products/<int:product_id>', methods=['PUT'])
@jwt_required()
def update_product(product_id):
    if not admin_required():
        return jsonify({'error': 'Acceso denegado.'}), 403
    try:
        data = request.get_json() or {}
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Producto no encontrado'}), 404

        # Actualizaciones parciales de campos de texto simples
        for field in ['name', 'description', 'short_description', 'brand', 'image_url']:
            if field in data:
                setattr(product, field, data[field] or '')

        # numéricos / flags base
      

        if 'price' in data:
            product.price = float(data['price'])

        # ✅ guardar precio mayorista
        if 'price_wholesale' in data:
            try:
                product.price_wholesale = float(data['price_wholesale']) if data['price_wholesale'] not in ("", None) else None
            except:
                product.price_wholesale = None

        if 'category_id' in data:
            next_category_id = int(data['category_id'])
            safe_category = _ensure_category_exists(next_category_id)
            product.category_id = safe_category.id
        if 'is_active' in data:
            product.is_active = bool(data['is_active'])
            # 👇 NUEVO: puffs (caladas)
        if 'puffs' in data:
            v = str(data.get('puffs','')).strip()
            product.puffs = int(v) if v.isdigit() else None
        if 'volume_ml' in data:
            try:
                raw = data.get('volume_ml')
                product.volume_ml = None if raw in ("", None) else max(0, int(float(raw)))
            except Exception:
                product.volume_ml = None
        volume_options_updated = False
        if 'volume_options' in data:
            product.volume_options = _normalize_volume_options(data.get('volume_options'))
            volume_options_updated = True
        # 🔥 AGREGAR ESTO
        if volume_options_updated and product.volume_options and len(product.volume_options) > 0:
            first = product.volume_options[0]
            if first.get('price') is not None:
                product.price = float(first.get('price'))
            if first.get('price_wholesale') is not None:
                product.price_wholesale = float(first.get('price_wholesale'))


        # ===== NUEVO: catálogo y modo =====
        if ('flavor_catalog' in data) or ('flavor_stock_mode' in data) or ('flavor_enabled' in data) or ('flavors' in data):
            catalog = _normalize_catalog(data.get('flavor_catalog') if 'flavor_catalog' in data else product.flavor_catalog)
            product.flavor_catalog = catalog

            if 'flavor_stock_mode' in data:
                product.flavor_stock_mode = bool(data['flavor_stock_mode'])

            if 'flavor_enabled' in data:
                product.flavor_enabled = bool(data['flavor_enabled'])

            # flavors visibles = nombres de los activos del catálogo (si hay), sino respeta 'flavors'
            if catalog:
                product.flavors = [f['name'] for f in catalog if f.get('active')]
            elif 'flavors' in data:
                product.flavors = data.get('flavors', []) or []

            # stock total coherente
            if product.flavor_stock_mode:
                product.stock = _sum_active_stock(catalog)
            elif 'stock' in data:
                try:
                    product.stock = int(data['stock'])
                except Exception:
                    product.stock = 0
            elif volume_options_updated:
                product.stock = _sum_volume_stock(product.volume_options or [])
        else:
            # sin cambios de catálogo: respetar 'stock' si vino
            if 'stock' in data:
                try:
                    product.stock = int(data['stock'])
                except Exception:
                    product.stock = 0
            elif volume_options_updated and not product.flavor_stock_mode:
                product.stock = _sum_volume_stock(product.volume_options or [])
        product.created_at = now_cba_naive()
        db.session.commit()
        if 'is_best_seller' in data:
            set_product_best_seller(product.id, bool(data.get('is_best_seller')))
        if 'is_home_featured' in data:
            try:
                set_product_home_featured(product.id, bool(data.get('is_home_featured')))
            except ValueError as e:
                return jsonify({'error': str(e)}), 400
        return jsonify({'message': 'Producto actualizado exitosamente', 'product': product.serialize()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error al actualizar producto: {str(e)}'}), 500


@admin_bp.route('/products/<int:product_id>', methods=['DELETE'])
@jwt_required()
def delete_product(product_id):
    if not admin_required():
        return jsonify({'error': 'Acceso denegado.'}), 403
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Producto no encontrado'}), 404

        hard = str(request.args.get('hard', '')).lower() in ('1','true','yes')

        if hard:
            # Con ON DELETE CASCADE, al borrar el product se borran sus imágenes
            db.session.delete(product)
        else:
            product.is_active = False  # comportamiento anterior (soft delete)

        db.session.commit()
        return jsonify({'message': 'Producto eliminado'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error al eliminar producto: {str(e)}'}), 500



@admin_bp.route('/products', methods=['GET'])
@jwt_required()
def get_all_products_admin():
    """Obtener todos los productos (incluyendo inactivos) para admin"""
    if not admin_required():
        return jsonify({'error': 'Acceso denegado. Se requieren permisos de administrador.'}), 403
    
    try:
        _ensure_category_exists(8)
        db.session.commit()
        products = Product.query.all()  # Incluye productos inactivos
        return jsonify(attach_best_seller_flags(products)), 200
        
    except Exception as e:
        return jsonify({'error': f'Error al obtener productos: {str(e)}'}), 500


# =======================
#       CATEGORÍAS
# =======================

@admin_bp.route('/categories', methods=['POST'])
@jwt_required()
def create_category():
    """Crear una nueva categoría (solo admin)"""
    if not admin_required():
        return jsonify({'error': 'Acceso denegado. Se requieren permisos de administrador.'}), 403
    
    try:
        data = request.get_json() or {}
        
        if 'name' not in data:
            return jsonify({'error': 'Campo requerido: name'}), 400
        
        category = Category(
            name=data['name'],
            description=data.get('description', '')
        )
        
        db.session.add(category)
        db.session.commit()
        
        return jsonify({
            'message': 'Categoría creada exitosamente',
            'category': category.serialize()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error al crear categoría: {str(e)}'}), 500




@admin_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_image():
    """
    Sube una imagen desde Admin, la optimiza y la guarda en la BD (ProductImage).
    Devuelve la URL interna: /public/img/<id>
    Campos aceptados (form-data):
      - image: archivo
      - product_id (opcional): int para asociar al producto
      - format (opcional): 'webp' | 'jpeg' (default: webp)
      - max_size (opcional): lado mayor, int (default: 1600)
    """
    if not admin_required():
        return jsonify({'error': 'Acceso denegado.'}), 403

    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'Falta el archivo "image"'}), 400

    # Parámetros opcionales
    target_format = (request.form.get('format') or 'webp').lower()
    max_size = int(request.form.get('max_size') or 1600)
    product_id = request.form.get('product_id')
    product_id = int(product_id) if product_id and product_id.isdigit() else None

    # Leer bytes originales (para digest/ETag)
    original_bytes = file.read()
    if not original_bytes:
        return jsonify({'error': 'Archivo vacío'}), 400

    # Abrir con Pillow y normalizar orientación
    try:
        img = Image.open(io.BytesIO(original_bytes))
        img = ImageOps.exif_transpose(img)
        # Convertimos a RGB para evitar problemas de modo (p.ej. PNG con alpha → lo podés mantener si querés)
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
    except Exception as e:
        return jsonify({'error': f'No se pudo leer la imagen: {str(e)}'}), 400

    # Resize "thumbnail" mantiene aspect ratio
    img.thumbnail((max_size, max_size))

    # Serializar optimizada a bytes en memoria
    out = io.BytesIO()
    if target_format == 'jpeg':
        # JPEG progresivo
        img = img.convert('RGB')
        img.save(out, format='JPEG', quality=82, optimize=True, progressive=True)
        mime = 'image/jpeg'
    else:
        # WEBP (recomendado: más liviano, soporte general actual)
        # Si hay alpha y querés preservarla:
        if img.mode == 'RGBA':
            img.save(out, format='WEBP', quality=80, method=6, lossless=False)
        else:
            img.save(out, format='WEBP', quality=80, method=6)
        mime = 'image/webp'

    optimized_bytes = out.getvalue()
    width, height = img.size

    # Digest para ETag/caché y deduplicación opcional
    digest = hashlib.sha256(optimized_bytes).hexdigest()

    # Guardar en BD
    db_image = ProductImage(
        product_id=product_id,
        mime_type=mime,
        bytes=optimized_bytes,
        width=width,
        height=height,
        digest=digest,
        created_at=now_cba_naive(),
    )
    db.session.add(db_image)
    db.session.commit()

    # URL interna que sirve desde la BD
    img_url = url_for('public.serve_image', image_id=db_image.id)

# Si vino product_id, asociamos la imagen y, SOLO si no hay principal o si el admin lo pide,
# la dejamos como principal (no pisamos siempre).
    if product_id:
        product = Product.query.get(product_id)
        if product:
            set_as_main = (request.form.get('as_main') in ('1', 'true', 'yes')) or not product.image_url
            if set_as_main:
                product.image_url = img_url
            db.session.commit()

    return jsonify({'url': img_url, 'image_id': db_image.id}), 201


# --- NUEVO: asociar imágenes huérfanas a un producto ---
@admin_bp.route('/products/<int:product_id>/attach-images', methods=['POST'])
@jwt_required()
def attach_images(product_id):
    if not admin_required():
        return jsonify({'error': 'Acceso denegado.'}), 403

    data = request.get_json() or {}
    image_ids = data.get('image_ids') or []
    main_id = data.get('main_id')  # opcional: id de la imagen principal

    if not isinstance(image_ids, list):
        return jsonify({'error': 'image_ids debe ser lista de enteros'}), 400

    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Producto no encontrado'}), 404

    # Buscar y asociar
    imgs = ProductImage.query.filter(ProductImage.id.in_(image_ids)).all()
    for im in imgs:
        im.product_id = product_id
    db.session.commit()

    # Si mandaste main_id, setear imagen principal (sin pisar si ya hay una a menos que la pidas)
    if main_id:
        try:
            main_id = int(main_id)
            # armamos la misma URL que devolvés al subir (/public/img/<id>)
            product.image_url = f"/public/img/{main_id}"
            db.session.commit()
        except Exception:
            db.session.rollback()

    return jsonify({
        'message': f'{len(imgs)} imágenes asociadas al producto {product_id}.',
        'attached_ids': [im.id for im in imgs],
        'product_id': product_id
    }), 200


# --- NUEVO: eliminar imagen por ID ---
@admin_bp.route('/images/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_image(image_id):
    if not admin_required():
        return jsonify({'error': 'Acceso denegado.'}), 403

    img = ProductImage.query.get(image_id)
    if not img:
        return jsonify({'error': 'Imagen no encontrada'}), 404

    # Guardamos el product_id antes de borrar para poder ajustar principal
    pid = img.product_id

    db.session.delete(img)
    db.session.commit()

    # Si estaba asociada a un producto y la principal del producto apuntaba a esta imagen,
    # reasignar principal a otra imagen del mismo producto (si existe), o dejar None.
    if pid:
        product = Product.query.get(pid)
        if product:
            # ¿La principal apuntaba a /public/img/<image_id>?
            current = (product.image_url or '').strip()
            is_same = current.endswith(f"/public/img/{image_id}") or current == f"/public/img/{image_id}"
            if is_same:
                # Buscar otra imagen del producto
                next_img = ProductImage.query.filter_by(product_id=pid).order_by(ProductImage.id.asc()).first()
                product.image_url = f"/public/img/{next_img.id}" if next_img else None
                db.session.commit()

    return jsonify({'message': f'Imagen {image_id} eliminada'}), 200


# =======================
#        PEDIDOS (ADMIN)
# =======================



@admin_bp.route("/orders", methods=["GET"])
@jwt_required()
def admin_get_orders():
    """Obtener todos los pedidos (para el panel de administración)."""
    if not admin_required():
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403

    try:
        orders = Order.query.order_by(Order.created_at.desc()).all()
        serialized = []

        for o in orders:
            serialized.append({
                "id": o.id,
                "status": o.status,
                "public_order_number": o.public_order_number, 
                "total_amount": float(o.total_amount or 0),
                "shipping_cost": float(o.shipping_cost or 0),
                "payment_method": o.payment_method,
                "payment_id": o.payment_id,
                "external_reference": o.external_reference,
                "customer_first_name": o.customer_first_name,
                "customer_last_name": o.customer_last_name,
                "customer_email": o.customer_email,
                "customer_phone": o.customer_phone,
                "customer_comment": o.customer_comment,
                "shipping_address": o.shipping_address,
                "billing_address": o.billing_address,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "order_items": [item.serialize() for item in o.order_items],
                "customer_dni": o.customer_dni,
                "customer_postal_code": (
                    o.shipping_address.get("postalCode") if isinstance(o.shipping_address, dict) else None
                ),


            })

        return jsonify(serialized), 200

    except Exception as e:
        return jsonify({"error": f"Error al obtener pedidos: {str(e)}"}), 500



@admin_bp.route("/orders/<int:order_id>/status", methods=["PUT"])
@jwt_required()
def admin_update_order_status(order_id):
    if not admin_required():
        return jsonify({"error": "Acceso denegado"}), 403

    try:
        data = request.get_json() or {}
        new_status = (data.get("status") or "").strip().lower()
        tracking_code = (data.get("tracking_code") or "").strip()

        valid_statuses = ["pending", "pagado", "enviado", "cancelado"]
        if new_status not in valid_statuses:
            return jsonify({"error": f"Estado inválido"}), 400

        order = Order.query.get(order_id)
        if not order:
            return jsonify({"error": "Pedido no encontrado"}), 404

        order.status = new_status
        if tracking_code:
            order.tracking_code = tracking_code
        order.updated_at = now_cba_naive()
        db.session.commit()

        # ✅ Enviar mail si se marca como enviado
        if new_status == "enviado" and order.customer_email:
            from flask_mail import Message
            from app import mail

            # Construir el cuerpo del mensaje según haya código o no
            if tracking_code:
                tracking_line = f"El código de seguimiento es: {tracking_code}.\n\n"
            else:
                tracking_line = ""

            msg = Message(
                subject="Tu pedido está en camino 🚚",
                recipients=[order.customer_email],
                body=(
                    f"Hola {order.customer_first_name or ''},\n\n"
                    f"Tu pedido #{order.public_order_number or order.id} fue enviado.\n"
                    f"{tracking_line}"
                    "¡Gracias por tu compra!\nZarpados."
                ),
            )

            mail.send(msg)

        return jsonify({
           "message": f"Pedido #{order.public_order_number or order.id} actualizado a '{new_status}'",
            "order": order.serialize()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
# Alias temporal para compatibilidad con /admin/pedidos
from flask import redirect

# Alias temporal para compatibilidad con /admin/pedidos
@admin_bp.route("/pedidos", methods=["GET"])
@jwt_required()
def alias_pedidos():
    if not admin_required():
        return jsonify({"error": "Acceso denegado"}), 403
    try:
        orders = Order.query.order_by(Order.created_at.desc()).all()
        serialized = [
            {
                "id": o.id,
                "status": o.status,
                "public_order_number": o.public_order_number, 
                "total_amount": float(o.total_amount or 0),
                "shipping_cost": float(o.shipping_cost or 0),
                "payment_method": o.payment_method,
                "payment_id": o.payment_id,
                "external_reference": o.external_reference,
                "customer_first_name": o.customer_first_name,
                "customer_last_name": o.customer_last_name,
                "customer_email": o.customer_email,
                "customer_phone": o.customer_phone,
                "customer_comment": o.customer_comment,
                "shipping_address": o.shipping_address,
                "billing_address": o.billing_address,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "order_items": [item.serialize() for item in o.order_items],
                "customer_dni": o.customer_dni,
                "customer_postal_code": (
                    o.shipping_address.get("postalCode") if isinstance(o.shipping_address, dict) else None
                ),



            }
            for o in orders
        ]
        return jsonify(serialized), 200
    except Exception as e:
        return jsonify({"error": f"Error al obtener pedidos: {str(e)}"}), 500

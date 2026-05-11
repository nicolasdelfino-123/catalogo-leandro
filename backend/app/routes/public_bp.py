from flask import Blueprint, jsonify, request,abort, make_response
from app import db
from app.models import Product, Category
import os
from flask import send_from_directory, current_app
from app.models import ProductImage
import hashlib
import json
from sqlalchemy.orm.attributes import flag_modified

import smtplib
import os
from email.mime.text import MIMEText
from email.utils import formataddr
from flask import Blueprint, request, jsonify
from app.best_sellers import attach_best_seller_flags




public_bp = Blueprint('public', __name__)

def _ensure_best_sellers_category_exists():
    category = Category.query.get(8)
    if category:
        return category

    by_name = Category.query.filter_by(name="Mas Vendidos").first()
    if by_name:
        return by_name

    category = Category(
        id=8,
        name="Mas Vendidos",
        description="Categoría auto-creada (Mas Vendidos)"
    )
    db.session.add(category)
    db.session.flush()
    return category

@public_bp.route('/')
def home():
    return jsonify({'msg':'Home Page'})

@public_bp.route('/demo')
def demo():
    return jsonify({'msg':'Este es un mensaje que viene desde el backend, especificamente la Demo Page... :)'}), 200

@public_bp.route('/about')
def about():
    return jsonify({'msg':'About Page'})

# === RUTAS PÚBLICAS PARA LA TIENDA DE VAPES ===

@public_bp.route('/products', methods=['GET'])
def get_products():
    """Obtener todos los productos activos"""
    try:
        # Parámetros opcionales de filtrado
        category_id = request.args.get('category_id', type=int)
        search = request.args.get('search', '')
        
        # Query base
        query = Product.query.filter(Product.is_active == True)
        
        # Filtrar por categoría si se especifica
        if category_id:
            query = query.filter(Product.category_id == category_id)
        
        # Filtrar por búsqueda si se especifica
        if search:
            query = query.filter(Product.name.ilike(f'%{search}%'))
        
        products = query.all()
        return jsonify(attach_best_seller_flags(products)), 200
        
    except Exception as e:
        return jsonify({'error': 'Error al obtener productos: ' + str(e)}), 500

@public_bp.route('/products/<int:product_id>', methods=['GET'])
def get_product_by_id(product_id):
    """Obtener un producto específico por ID"""
    try:
        product = Product.query.filter(
            Product.id == product_id, 
            Product.is_active == True
        ).first()
        
        if not product:
            return jsonify({'error': 'Producto no encontrado'}), 404
            
        return jsonify(attach_best_seller_flags([product])[0]), 200
        
    except Exception as e:
        return jsonify({'error': 'Error al obtener producto: ' + str(e)}), 500

@public_bp.route('/categories', methods=['GET'])
def get_categories():
    """Obtener todas las categorías"""
    try:
        _ensure_best_sellers_category_exists()
        db.session.commit()
        categories = Category.query.all()
        return jsonify([category.serialize() for category in categories]), 200
        
    except Exception as e:
        return jsonify({'error': 'Error al obtener categorías: ' + str(e)}), 500

@public_bp.route('/categories/<int:category_id>/products', methods=['GET'])
def get_products_by_category(category_id):
    """Obtener productos de una categoría específica"""
    try:
        category = Category.query.get(category_id)
        if not category:
            return jsonify({'error': 'Categoría no encontrada'}), 404
            
        products = Product.query.filter(
            Product.category_id == category_id,
            Product.is_active == True
        ).all()
        
        return jsonify({
            'category': category.serialize(),
            'products': attach_best_seller_flags(products)
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Error al obtener productos de la categoría: ' + str(e)}), 500
    

@public_bp.route('/send-mail', methods=['POST'])
def send_mail():
    data = request.get_json()
    name = data.get("name")
    email = data.get("email")
    phone = data.get("phone")
    message = data.get("message")

    body = f"""
    Nueva solicitud mayorista:
    Nombre: {name}
    Email: {email}
    Teléfono: {phone}
    Mensaje: {message}
    """

    try:
        # 🧠 Forzamos UTF-8 explícitamente
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = "Nueva solicitud mayorista"
        msg["From"] = formataddr(("Web Zarpados Vaps", os.getenv("MAIL_USERNAME")))
        msg["To"] = "nicolasdelfino585@gmail.com"
        msg.set_charset("utf-8")  # 👈 fuerza codificación real

        # 📬 Envío seguro
        with smtplib.SMTP_SSL(os.getenv("MAIL_SERVER"), 465) as server:
            server.login(os.getenv("MAIL_USERNAME"), os.getenv("MAIL_PASSWORD"))
            server.sendmail(
                os.getenv("MAIL_USERNAME"),
                ["nicolasdelfino585@gmail.com"],
                msg.as_string().encode("utf-8")  # 👈 importante: convertir a bytes UTF-8
            )

        return jsonify({"message": "ok"}), 200

    except Exception as e:
        print("⚠️ Error enviando correo:", e)
        return jsonify({"error": str(e)}), 500
        
        
@public_bp.route('/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    folder = current_app.config.get('UPLOAD_FOLDER', os.path.join(os.getcwd(), 'uploads'))
    return send_from_directory(folder, filename, max_age=60*60*24*30)  # cache 30 días



@public_bp.route('/img/<int:image_id>')
def serve_image(image_id: int):
    img = ProductImage.query.get(image_id)
    if not img or not img.bytes:
        abort(404)

    # ETag basado en digest si existe, sino en hash de bytes
    etag = img.digest or hashlib.sha256(img.bytes).hexdigest()

    # Respuesta binaria con cabeceras de caché agresivas
    resp = make_response(img.bytes)
    resp.headers['Content-Type'] = img.mime_type or 'application/octet-stream'
    resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'  # 1 año + immutable
    resp.headers['ETag'] = etag
    return resp

from app.models import Order, OrderItem, now_cba_naive


@public_bp.route('/orders', methods=['POST'])
def create_order():
    try:
        data = request.get_json() or {}

        order = Order(
            total_amount=float(data.get("total_amount") or 0),
            payment_method=data.get("payment_method") or "coordinar",
            customer_first_name=data.get("customer_first_name"),
            customer_phone=data.get("customer_phone"),
            shipping_address=data.get("shipping_address") or {},
            status="pending"
        )

        db.session.add(order)
        db.session.flush()  # obtiene order.id

        for item in data.get("order_items", []):

            # tamaño ml seguro
            raw_size_ml = item.get("selected_size_ml")
            try:
                selected_size_ml = int(raw_size_ml) if raw_size_ml not in (None, "") else None
            except (TypeError, ValueError):
                selected_size_ml = None

            # cantidad segura
            try:
                qty = int(item.get("quantity", 1) or 1)
            except (TypeError, ValueError):
                qty = 1

            # precio seguro
            try:
                price = float(item.get("price") or 0)
            except (TypeError, ValueError):
                price = 0

            product_id = item.get("product_id")

            order_item = OrderItem(
                order_id=order.id,
                product_id=product_id,
                quantity=qty,
                price=price,
                selected_flavor=item.get("selected_flavor"),
                selected_size_ml=selected_size_ml
            )
            db.session.add(order_item)

            # ✅ Descontar stock real para que AdminProducts quede consistente
            if product_id:
                product = Product.query.get(product_id)
            else:
                product = None

            if product:
                try:
                    product.stock = max(0, int(product.stock or 0) - qty)
                except (TypeError, ValueError):
                    product.stock = 0

                if selected_size_ml is not None and product.volume_options:
                    options = json.loads(json.dumps(product.volume_options or []))

                    for row in options:
                        try:
                            row_ml = int(row.get("ml")) if row.get("ml") not in (None, "") else None
                        except (TypeError, ValueError):
                            row_ml = None

                        if row_ml == selected_size_ml:
                            try:
                                row["stock"] = max(0, int(row.get("stock") or 0) - qty)
                            except (TypeError, ValueError):
                                row["stock"] = 0
                            break

                    product.volume_options = options
                    flag_modified(product, "volume_options")

                    try:
                        product.stock = sum(max(0, int(x.get("stock") or 0)) for x in options)
                    except Exception:
                        product.stock = 0

        db.session.commit()

        return jsonify({"msg": "orden creada"}), 201

    except Exception as e:
        db.session.rollback()
        print("ERROR creando orden:", e)
        return jsonify({"error": str(e)}), 500

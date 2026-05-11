import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "";

export default function AdminPedidos() {
    const [orders, setOrders] = useState([]);
    const [selected, setSelected] = useState(null); // 🆕 Pedido seleccionado
    const [loadingId, setLoadingId] = useState(null);
    const navigate = useNavigate();

    const token =
        localStorage.getItem("token") || localStorage.getItem("admin_token");

    const fetchOrders = async () => {
        try {
            const res = await fetch(`${API}/admin/orders`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();

            // ✅ No tocamos los datos, el backend ya manda public_order_number correcto
            setOrders(data || []);
        } catch (err) {
            console.error("Error fetching orders:", err);
        }
    };


    useEffect(() => {
        fetchOrders();
    }, []);

    const updateStatus = async (id, status, tracking_code = "") => {
        try {
            const res = await fetch(`${API}/admin/orders/${id}/status`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status, tracking_code }),
            });
            if (!res.ok) throw new Error("No se pudo actualizar el estado");
            await fetchOrders();
            alert("Estado actualizado y email enviado al cliente");
        } catch (err) {
            console.error(err);
            alert("Error actualizando estado");
        }
    };


    return (
        <div className="p-6">
            <button
                onClick={() => navigate(-1)}
                className="mb-4 px-4 py-2 rounded-lg bg-[#232325] text-white hover:bg-black transition-colors"
            >
                Volver
            </button>
            <h1 className="text-2xl font-bold mb-4 text-center">Pedidos recibidos</h1>

            {orders.length === 0 && (
                <p className="text-gray-500 text-center mt-10">No hay pedidos aún.</p>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm border">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-2 text-left">#</th>
                            <th className="p-2 text-left">Cliente</th>
                            {/*            <th className="p-2 text-left">Email</th> */}
                            <th className="p-2 text-left">Total</th>
                            {/*  <th className="p-2 text-left">Estado</th> */}
                            <th className="p-2 text-left">Fecha</th>
                            <th className="p-2 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((o) => (
                            <tr key={o.id} className="border-t hover:bg-gray-50">
                                <td className="p-2 font-semibold text-gray-700">
                                    #{o.public_order_number || o.id}

                                </td>



                                <td className="p-2">{o.customer_first_name} {o.customer_last_name}</td>
                                {/*     <td className="p-2">{o.customer_email}</td> */}
                                <td className="p-2">${o.total_amount?.toLocaleString() || 0}</td>
                                {/*     <td className="p-2">
                                    <span
                                        className={`px-2 py-1 rounded text-xs ${o.status === "enviado"
                                            ? "bg-green-100 text-green-800"
                                            : o.payment_method === "transferencia"
                                                ? "bg-orange-100 text-orange-800"
                                                : "bg-yellow-100 text-yellow-800"
                                            }`}
                                    >
                                        {o.status || "pendiente"}
                                    </span>

                                </td> */}
                                <td className="p-2">
                                    {new Date(o.created_at).toLocaleString("es-AR")}
                                </td>
                                <td className="p-2 flex gap-2 justify-center">
                                    <button
                                        onClick={() => setSelected(o)}
                                        className="px-3 py-1 border rounded hover:bg-gray-100"
                                    >
                                        Ver detalle
                                    </button>
                                    {/* {o.status !== "enviado" && (
                                        <button
                                            onClick={() => updateStatus(o.id, "enviado")}
                                            className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                            Marcar enviado
                                        </button>
                                    )} */}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 🆕 Modal de detalle */}
            {selected && (() => {

                const items = selected.order_items || selected.items || [];
                const customerPhone = selected.customer_phone || selected.shipping_address?.phone || "";
                const getItemBrand = (item) =>
                    item?.product_brand ||
                    item?.brand ||
                    item?.marca ||
                    item?.product?.brand ||
                    item?.product?.marca ||
                    null;

                const getItemMl = (item) => {
                    const raw =
                        item?.selected_size_ml ??
                        item?.product_volume_ml ??
                        item?.volume_ml ??
                        item?.size_ml ??
                        item?.ml ??
                        item?.product?.volume_ml;
                    const n = Number(
                        typeof raw === "string" ? raw.replace(/[^\d.]/g, "") : raw
                    );
                    return Number.isFinite(n) && n > 0 ? `${Math.floor(n)}ml` : null;
                };

                // detectar mayorista: si los precios parecen mayoristas
                const isWholesale = items.some(i => i.price && i.price < 1000);
                const currency = isWholesale ? "$" : "$";

                return (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-3xl rounded-lg shadow-lg p-6 relative overflow-y-auto max-h-[90vh]">

                            <button
                                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                                onClick={() => setSelected(null)}
                            >
                                ✕
                            </button>

                            {/* HEADER PEDIDO */}
                            <div className="mb-4">
                                <h2 className="text-xl font-semibold">
                                    {isWholesale ? "📦 Pedido Mayorista" : "🛍️ Pedido Minorista"} #{selected.public_order_number || selected.id}
                                </h2>

                                <p className="text-sm text-gray-500">
                                    {new Date(selected.created_at).toLocaleString("es-AR")}
                                </p>
                            </div>

                            {/* CLIENTE */}
                            <div className="mb-4 space-y-1">
                                <p>
                                    <strong>Cliente:</strong> {selected.customer_first_name}
                                </p>

                                <p>
                                    <strong>Teléfono:</strong> {customerPhone || "Sin teléfono"}
                                </p>

                                <p>
                                    <strong>Forma de pago:</strong>{" "}
                                    {{
                                        transferencia: "Transferencia",
                                        efectivo: "Efectivo",
                                        coordinar: "A coordinar",
                                    }[selected.payment_method] || selected.payment_method}
                                </p>
                            </div>

                            {/* ENVÍO */}
                            <div className="mb-4">
                                <h3 className="font-semibold mb-1">Datos de envío</h3>

                                <p>
                                    <strong>Ubicación:</strong>{" "}
                                    {selected.shipping_address?.city ||
                                        selected.shipping_address?.address ||
                                        "Retiro en local"}
                                </p>
                            </div>

                            {/* Productos */}
                            <h3 className="text-lg font-medium mb-2">Productos</h3>

                            <div className="border rounded">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="p-2 text-left">Producto</th>
                                            <th className="p-2 text-center">Cant.</th>
                                            <th className="p-2 text-right">Precio</th>
                                            <th className="p-2 text-right">Subtotal</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {items.map((i, idx) => {
                                            const itemBrand = getItemBrand(i);
                                            const itemMl = getItemMl(i);

                                            return (
                                                <tr key={idx} className="border-t">

                                                    <td className="p-2">
                                                        <span className="font-medium">
                                                            {i.product_name || i.title || "Producto sin nombre"}
                                                        </span>
                                                        {(itemBrand || itemMl) && (
                                                            <span className="block text-xs text-gray-500">
                                                                {[itemBrand, itemMl]
                                                                    .filter(Boolean)
                                                                    .join(" - ")}
                                                            </span>
                                                        )}

                                                        {i.selected_flavor && (
                                                            <span className="block text-xs text-gray-500">
                                                                Sabor: {i.selected_flavor}
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        {i.quantity}
                                                    </td>

                                                    <td className="p-2 text-right">
                                                        {currency}{i.price?.toLocaleString() || 0}
                                                    </td>

                                                    <td className="p-2 text-right">
                                                        {currency}{(i.quantity * i.price).toLocaleString() || 0}
                                                    </td>

                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    <tfoot>
                                        <tr className="border-t font-semibold">
                                            <td colSpan="3" className="p-2 text-right">
                                                Total
                                            </td>

                                            <td className="p-2 text-right">
                                                {currency}{selected.total_amount?.toLocaleString() || 0}
                                            </td>
                                        </tr>
                                    </tfoot>

                                </table>
                            </div>

                        </div>
                    </div>
                );

            })()}
        </div>
    );
}

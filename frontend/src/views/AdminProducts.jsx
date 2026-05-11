import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import sinImagen from '@/assets/sin_imagen.jpg'
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "../utils/price.js";
import AdminBudgetToolbar from "../components/admin/AdminBudgetToolbar.jsx";
import AdminBudgetSelectionCell from "../components/admin/AdminBudgetSelectionCell.jsx";
import AdminBudgetModal from "../components/admin/AdminBudgetModal.jsx";
import {
    CATEGORY_ID_TO_NAME as ID_TO_CATEGORY_NAME,
    getDisplayCategoryName,
    mapCategoryIdFromName,
    PERFUME_CATEGORY_DEFINITIONS,
    PERFUME_CATEGORY_NAMES,
} from "../utils/perfumeCategories.js";




const normalizeCategoryLabel = (value = "") =>
    String(value || "")
        .trim()
        .toLowerCase();

const parseFlexibleDecimal = (value) => {
    if (value === "" || value === null || value === undefined) return null;

    const raw = String(value).trim().replace(/\s+/g, "");
    if (!raw) return null;

    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const hasComma = lastComma >= 0;
    const hasDot = lastDot >= 0;

    let normalized = raw.replace(/[.,]/g, "");

    if (hasComma || hasDot) {
        const separatorIndex = Math.max(lastComma, lastDot);
        const decimalPart = raw.slice(separatorIndex + 1).replace(/[.,]/g, "");
        const integerPart = raw.slice(0, separatorIndex).replace(/[.,]/g, "") || "0";
        const hasMixedSeparators = hasComma && hasDot;
        const treatAsDecimal =
            decimalPart.length > 0 &&
            (hasMixedSeparators || decimalPart.length <= 2);

        normalized = treatAsDecimal ? `${integerPart}.${decimalPart}` : integerPart + decimalPart;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatEditableMoney = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "";
    if (Number.isInteger(parsed)) return String(parsed);
    return String(parsed).replace(".", ",");
};

const stripHtml = (value = "") =>
    String(value || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const sanitizeRichHtml = (html = "") => {
    const source = String(html || "");
    if (!source.trim()) return "";

    const parser = new DOMParser();
    const parsed = parser.parseFromString(source, "text/html");
    const allowed = new Set(["STRONG", "EM", "B", "I", "U", "BR", "P", "DIV", "UL", "OL", "LI"]);

    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || "";
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return "";
        }

        const tag = node.tagName.toUpperCase();
        const children = Array.from(node.childNodes).map(walk).join("");

        if (tag === "BR") return "<br>";

        if (!allowed.has(tag)) {
            const style = String(node.getAttribute("style") || "").toLowerCase();
            const isBold = /font-weight\s*:\s*(bold|[5-9]00)/.test(style);
            if (isBold && children.trim()) return `<strong>${children}</strong>`;
            return children;
        }

        if (tag === "B") return `<strong>${children}</strong>`;
        if (tag === "I") return `<em>${children}</em>`;
        return `<${tag.toLowerCase()}>${children}</${tag.toLowerCase()}>`;
    };

    return Array.from(parsed.body.childNodes).map(walk).join("");
};

function RichTextInput({ value = "", onChange, placeholder = "", minHeight = "120px" }) {
    const editorRef = useRef(null);

    useEffect(() => {
        const next = sanitizeRichHtml(value);
        if (!editorRef.current) return;
        if (editorRef.current.innerHTML !== next) {
            editorRef.current.innerHTML = next;
        }
    }, [value]);

    const emitChange = () => {
        if (!editorRef.current) return;
        onChange(sanitizeRichHtml(editorRef.current.innerHTML));
    };

    const insertHtmlAtCursor = (html) => {
        if (!html) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            editorRef.current?.focus();
            document.execCommand("insertHTML", false, html);
            return;
        }
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const temp = document.createElement("div");
        temp.innerHTML = html;
        const frag = document.createDocumentFragment();
        let lastNode = null;
        while (temp.firstChild) {
            lastNode = frag.appendChild(temp.firstChild);
        }
        range.insertNode(frag);
        if (lastNode) {
            const nextRange = document.createRange();
            nextRange.setStartAfter(lastNode);
            nextRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(nextRange);
        }
    };

    return (
        <div className="relative">
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 whitespace-pre-wrap"
                style={{ minHeight }}
                onInput={emitChange}
                onBlur={emitChange}
                onPaste={(e) => {
                    e.preventDefault();
                    const html = e.clipboardData?.getData("text/html") || "";
                    const text = e.clipboardData?.getData("text/plain") || "";
                    const toInsert = sanitizeRichHtml(html || text.replace(/\n/g, "<br>"));
                    insertHtmlAtCursor(toInsert);
                    emitChange();
                }}
            />
            {!stripHtml(value) && (
                <div className="pointer-events-none absolute left-3 top-2 text-gray-400 text-sm" style={{ left: "19px" }}>
                    {placeholder}
                </div>
            )}
        </div>
    );
}

const sumActiveFlavorStock = (catalog = []) =>
    (catalog || [])
        .filter((x) => x?.active)
        .reduce((acc, x) => acc + (Number.isFinite(Number(x?.stock)) ? Number(x.stock) : 0), 0)

// ----- Píldoras/lista de sabores con ACTIVO y STOCK -----
function FlavorPills({ catalog = [], onChange }) {
    const [input, setInput] = useState("")

    const normalize = (arr) =>
        (arr || []).map((f) => ({
            name: String(f?.name ?? f ?? "").trim(),
            active: Boolean(f?.active ?? true),
            stock: Number.isFinite(Number(f?.stock)) ? Number(f.stock) : 0,
        }))

    const ensure = (next) => onChange(normalize(next))

    const toggle = (idx) => {
        const next = [...catalog]
        next[idx] = { ...next[idx], active: !next[idx].active }
        ensure(next)
    }

    const remove = (idx) => {
        const next = catalog.filter((_, i) => i !== idx)
        ensure(next)
    }

    const changeName = (idx, name) => {
        const next = [...catalog]
        next[idx] = { ...next[idx], name }
        ensure(next)
    }

    const changeStock = (idx, stock) => {
        // Forzamos número entero >= 0
        const nRaw = Number(stock);
        const n = Number.isFinite(nRaw) ? Math.max(0, Math.floor(nRaw)) : 0;
        const next = [...catalog];
        next[idx] = { ...next[idx], stock: n };
        ensure(next);
    };


    const add = () => {
        const t = input.trim()
        if (!t) return
        ensure([...(catalog || []), { name: t, active: true, stock: 0 }])
        setInput("")
    }

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    className="flex-1 border rounded px-2 py-1"
                    placeholder="Agregar sabor y presionar Enter"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), add()) : null)}
                />
                <button type="button" onClick={add} className="px-3 py-1 border rounded">
                    Agregar
                </button>
            </div>

            <div className="border rounded">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-2 text-left">Activo</th>
                            <th className="p-2 text-left">Sabor</th>
                            <th className="p-2 text-left">Stock</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {normalize(catalog).map((f, idx) => (
                            <tr key={idx} className="border-t">
                                <td className="p-2">
                                    <input type="checkbox" checked={f.active} onChange={() => toggle(idx)} />
                                </td>
                                <td className="p-2">
                                    <input
                                        className="w-full border rounded px-2 py-1"
                                        value={f.name}
                                        onChange={(e) => changeName(idx, e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <input
                                        className="w-28 border rounded px-2 py-1 text-right"
                                        type="number"
                                        min={0}
                                        step={1}
                                        {...noSpin}
                                        value={f.stock}
                                        onChange={(e) => changeStock(idx, e.target.value)}
                                    />

                                </td>
                                <td className="p-2 text-right">
                                    <button
                                        type="button"
                                        onClick={() => remove(idx)}
                                        className="px-2 py-1 border rounded text-gray-600 hover:bg-gray-50"
                                        title="Quitar sabor"
                                    >
                                        🗑
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {(!catalog || catalog.length === 0) && (
                            <tr>
                                <td colSpan={4} className="p-3 text-center text-gray-500">
                                    Sin sabores cargados
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-gray-500">
                Solo los <strong>activos</strong> se publican en la web. El stock por sabor se usa si activás el modo “stock por sabor”.
            </p>
        </div>
    )
}

// arriba, junto a otros useRef/useState:
const API = import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "";

// Normaliza paths viejos
const normalizeImagePath = (u = "") => {
    if (!u) return "";
    // corrige cosas antiguas
    if (u.startsWith("/admin/uploads/")) u = u.replace("/admin", "/public");
    if (u.startsWith("/uploads/")) u = `/public${u}`; // si alguna vez vino sin /public
    return u;
};

// Extrae el ID numérico de URLs tipo "/public/img/123"
const extractImageId = (u = "") => {
    const m = String(u || "").match(/\/public\/img\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
};


// Convierte relativo → absoluto
// Debe quedar exactamente así:
const toAbsUrl = (u = "") => {
    u = normalizeImagePath(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;        // http(s) ya absoluto

    // ✅ SOLO assets del backend (tu server) van con API
    if (u.startsWith("/public/")) return `${API}${u}`;

    // ✅ Cualquier otro absoluto (p.ej. "/sin_imagen.jpg" en frontend) se deja igual
    if (u.startsWith("/")) return u;

    // 🧩 Relativo sin barra: si lo usás, asumimos backend
    return `${API}/${u}`;
};

const uniqPush = (arr = [], url = "") => {
    const u = normalizeImagePath(url);
    const set = new Set([...(arr || []), u]);
    return Array.from(set);
};

const isDefaultImage = (u = "") => {
    const s = String(u || "").trim();
    if (!s) return false;
    return s === String(sinImagen) || /sin_imagen/i.test(s);
};

// Evita que el número cambie con la rueda del mouse o flechas ↑ ↓
const noSpin = {
    onWheel: (e) => e.currentTarget.blur(),
    onKeyDown: (e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    },
};

const normalizeVolumeOptions = (rows = [], { keepWithoutMl = false } = {}) =>
    (rows || [])
        .map((row) => {
            const ml = Number(row?.ml);
            const price = parseFlexibleDecimal(row?.price);
            const stockRaw = Number(row?.stock);
            const priceWholesaleRaw = row?.price_wholesale;
            const priceWholesale =
                priceWholesaleRaw === "" || priceWholesaleRaw === null || priceWholesaleRaw === undefined
                    ? null
                    : parseFlexibleDecimal(priceWholesaleRaw);

            return {
                ml: Number.isFinite(ml) ? Math.max(0, Math.floor(ml)) : null,
                price: Number.isFinite(price) && price > 0 ? price : null,
                stock: Number.isFinite(stockRaw) ? Math.max(0, Math.floor(stockRaw)) : 0,
                price_wholesale:
                    Number.isFinite(priceWholesale) && priceWholesale > 0 ? priceWholesale : null,
            };
        })
        .filter((row) => keepWithoutMl || (row.ml != null && row.ml > 0));

const sortVolumeOptions = (a, b) => {
    const aml = a?.ml ?? null;
    const bml = b?.ml ?? null;
    if (aml == null && bml == null) return 0;
    if (aml == null) return 1;
    if (bml == null) return -1;
    return aml - bml;
};

const volumeOptionKey = (row) => (row?.ml == null ? "__without_ml__" : String(Number(row.ml)));

const upsertVolumeOption = (rows = [], row) => {
    const current = normalizeVolumeOptions(rows, { keepWithoutMl: true });
    const key = volumeOptionKey(row);
    const filtered = current.filter((x) => volumeOptionKey(x) !== key);
    return [...filtered, row].sort(sortVolumeOptions);
};

const clearPricingInputs = (state) => ({
    ...state,
    volume_ml: "",
    volume_stock: "",
    price: "",
    price_wholesale: "",
});

// ----- Componente principal -----
export default function AdminProducts() {
    const [products, setProducts] = useState([])
    const categories = ["Inicio", ...PERFUME_CATEGORY_NAMES]
    const [form, setForm] = useState(null)
    const [q, setQ] = useState("")
    const [selectedCategory, setSelectedCategory] = useState("Todos")
    const [selectedStatus, setSelectedStatus] = useState("todos")
    const [selectedStockFilter, setSelectedStockFilter] = useState("todos")
    // antes: const imgInputRef = useRef(null);
    const mainImgInputRef = useRef(null);
    const galImgInputRef = useRef(null);
    const resultsRef = useRef(null);
    const [editingPriceId, setEditingPriceId] = useState(null);
    const [editingPrice, setEditingPrice] = useState("");

    const [editingStockId, setEditingStockId] = useState(null);
    const [editingStock, setEditingStock] = useState("");
    const [selectedMlByProduct, setSelectedMlByProduct] = useState({});

    const [editingWholesaleId, setEditingWholesaleId] = useState(null);
    const [editingWholesale, setEditingWholesale] = useState("");
    const [budgetMode, setBudgetMode] = useState(false);
    const [budgetFilter, setBudgetFilter] = useState("all");
    const [budgetSelections, setBudgetSelections] = useState({});
    const [budgetModalOpen, setBudgetModalOpen] = useState(false);
    const [expandedMobileProductId, setExpandedMobileProductId] = useState(null);
    const [changingStatusId, setChangingStatusId] = useState(null);
    const [changingStatusMsg, setChangingStatusMsg] = useState("");
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingImageLabel, setUploadingImageLabel] = useState("");
    const [savingProduct, setSavingProduct] = useState(false);
    const productSaveInFlightRef = useRef(false);




    // Importación masiva
    const fileInputRef = useRef(null)
    const [importPreview, setImportPreview] = useState([]) // array transformado listo para crear
    const [importOpen, setImportOpen] = useState(false)
    const [importing, setImporting] = useState(false)
    const [showZeroStockModal, setShowZeroStockModal] = useState(false)
    const [showPriceWithoutMlModal, setShowPriceWithoutMlModal] = useState(false)
    const [pendingPriceWithoutMlRow, setPendingPriceWithoutMlRow] = useState(null)
    const [showMissingPricingModal, setShowMissingPricingModal] = useState(false)
    const [saveSuccessModal, setSaveSuccessModal] = useState({
        open: false,
        action: "",
        category: "",
    })

    const token = localStorage.getItem("token") || localStorage.getItem("admin_token")
    if (!token) return <div className="p-6">No autorizado</div>

    const scrollToResults = () => {
        window.requestAnimationFrame(() => {
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    };

    const fetchAll = async () => {
        try {
            const res = await fetch(`${API}/admin/products`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) {
                const data = await res.json()
                setProducts(data || [])
            }
        } catch (error) {
            console.error("Error fetching products:", error)
        }
    }

    const toggleProductFlag = async (product, field) => {
        const nextValue = !product?.[field];
        if (field === "is_home_featured" && nextValue) {
            const homeCount = products.filter((item) => item?.is_home_featured && item.id !== product.id).length;
            if (homeCount >= 12) {
                alert("Solo podés seleccionar hasta 12 productos para Inicio.");
                return;
            }
        }
        try {
            const res = await fetch(`${API}/admin/products/${product.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ [field]: nextValue }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(`No se pudo actualizar el producto: ${data?.error || res.statusText}`);
                return;
            }

            setProducts((prev) => {
                const rankField = field === "is_home_featured" ? "home_featured_rank" : "best_seller_rank";
                const currentIds = prev
                    .filter((item) => item?.[field])
                    .sort((a, b) => Number(a?.[rankField] ?? 999999) - Number(b?.[rankField] ?? 999999))
                    .map((item) => item.id);
                const nextIds = nextValue
                    ? [...currentIds.filter((id) => id !== product.id), product.id]
                    : currentIds.filter((id) => id !== product.id);
                const rankById = new Map(nextIds.map((id, idx) => [id, idx]));

                return prev.map((item) => {
                    const rank = rankById.get(item.id);
                    return {
                        ...item,
                        [field]: rank !== undefined,
                        [rankField]: rank ?? null,
                    };
                });
            });
        } catch (error) {
            console.error(error);
            alert("Error actualizando el producto");
        }
    };

    const toggleHomeFeatured = (product) => toggleProductFlag(product, "is_home_featured");
    const toggleBestSeller = (product) => toggleProductFlag(product, "is_best_seller");

    useEffect(() => {
        fetchAll()
    }, [])

    const startEditPrice = (p, currentPrice) => {
        setEditingPriceId(p.id);
        // mantengo como string lo que ve el usuario
        setEditingPrice(
            currentPrice == null || currentPrice === ""
                ? ""
                : formatEditableMoney(currentPrice ?? p.price)
        );
    };
    const startEditWholesale = (product, currentWholesale) => {
        setEditingWholesaleId(product.id);
        setEditingWholesale(
            currentWholesale == null || currentWholesale === ""
                ? ""
                : formatEditableMoney(currentWholesale)
        );

    };


    const cancelEditPrice = () => {
        setEditingPriceId(null);
        setEditingPrice("");
    };

    const confirmEditPrice = async () => {
        if (!editingPriceId) return;
        const newPriceNum = parseFlexibleDecimal(editingPrice);
        if (!Number.isFinite(newPriceNum) || newPriceNum < 0) {
            alert("Precio inválido");
            return;
        }
        const product = products.find((x) => x.id === editingPriceId);
        if (!product) return;

        const mlKey = selectedMlByProduct[editingPriceId] ?? getDefaultMlKey(product);
        const selectedMl = mlKey === "sin_ml" ? null : Number(mlKey);

        const baseOptions = normalizeVolumeOptions(product.volume_options || [], { keepWithoutMl: true });
        let payload = { price: newPriceNum };
        let nextProductPatch = { price: newPriceNum };

        if (Number.isFinite(selectedMl) && selectedMl > 0) {
            let found = false;
            const nextOptions = baseOptions.map((row) => {
                if (Number(row?.ml) === Number(selectedMl)) {
                    found = true;
                    return { ...row, price: newPriceNum };
                }
                return row;
            });
            if (!found) {
                nextOptions.push({
                    ml: Math.floor(selectedMl),
                    price: newPriceNum,
                    stock: Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0,
                    price_wholesale:
                        Number.isFinite(Number(product.price_wholesale)) && Number(product.price_wholesale) > 0
                            ? Number(product.price_wholesale)
                            : null,
                });
                nextOptions.sort(sortVolumeOptions);
            }
            payload = { volume_options: normalizeVolumeOptions(nextOptions) };
            nextProductPatch = { volume_options: nextOptions };
        }

        try {
            const res = await fetch(`${API}/admin/products/${editingPriceId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(`No se pudo actualizar el precio: ${data?.error || res.statusText}`);
                return;
            }
            // Refrescar rápido en memoria sin romper nada más
            setProducts((prev) => prev.map((x) => x.id === editingPriceId ? { ...x, ...nextProductPatch } : x));
            cancelEditPrice();
        } catch (e) {
            console.error(e);
            alert("Error actualizando el precio");
        }
    };
    const confirmEditWholesale = async () => {
        if (!editingWholesaleId) return;

        const newPrice = parseFlexibleDecimal(editingWholesale);


        if (newPrice !== null && (!Number.isFinite(newPrice) || newPrice < 0)) {
            alert("Precio mayorista inválido");
            return;
        }
        const product = products.find((x) => x.id === editingWholesaleId);
        if (!product) return;

        const mlKey = selectedMlByProduct[editingWholesaleId] ?? getDefaultMlKey(product);
        const selectedMl = mlKey === "sin_ml" ? null : Number(mlKey);

        const baseOptions = normalizeVolumeOptions(product.volume_options || [], { keepWithoutMl: true });
        let payload = { price_wholesale: newPrice };
        let nextProductPatch = { price_wholesale: newPrice };

        if (Number.isFinite(selectedMl) && selectedMl > 0) {
            let found = false;
            const nextOptions = baseOptions.map((row) => {
                if (Number(row?.ml) === Number(selectedMl)) {
                    found = true;
                    return { ...row, price_wholesale: newPrice };
                }
                return row;
            });
            if (!found) {
                nextOptions.push({
                    ml: Math.floor(selectedMl),
                    price:
                        Number.isFinite(Number(product.price)) && Number(product.price) > 0
                            ? Number(product.price)
                            : 0,
                    stock: Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0,
                    price_wholesale: newPrice,
                });
                nextOptions.sort(sortVolumeOptions);
            }
            payload = { volume_options: normalizeVolumeOptions(nextOptions) };
            nextProductPatch = { volume_options: nextOptions };
        }

        try {
            const res = await fetch(`${API}/admin/products/${editingWholesaleId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                alert(`No se pudo actualizar: ${data?.error || res.statusText}`);
                return;
            }

            // actualizar estado local
            setProducts(prev =>
                prev.map(p =>
                    p.id === editingWholesaleId
                        ? { ...p, ...nextProductPatch }
                        : p
                )
            );

            setEditingWholesaleId(null);
            setEditingWholesale("");
        } catch (e) {
            console.error(e);
            alert("Error actualizando precio mayorista");
        }
    };
    const startEditStock = (p, currentStock) => {
        const initialStock = currentStock ?? p.stock ?? 0;
        setEditingStockId(p.id);
        setEditingStock(Number(initialStock) === 0 ? "" : String(initialStock));
    };




    const cancelEditStock = () => {
        setEditingStockId(null);
        setEditingStock("");
    };

    const confirmEditStock = async () => {
        if (!editingStockId) return;

        const n = Math.floor(Number(editingStock));
        const newStock = Number.isFinite(n) && n >= 0 ? n : null;

        if (newStock === null) {
            alert("Stock inválido");
            return;
        }
        const product = products.find((x) => x.id === editingStockId);
        if (!product) return;

        const mlKey = selectedMlByProduct[editingStockId] ?? getDefaultMlKey(product);
        const selectedMl = mlKey === "sin_ml" ? null : Number(mlKey);
        const baseOptions = normalizeVolumeOptions(product.volume_options || [], { keepWithoutMl: true });
        let payload = { stock: newStock };
        let nextProductPatch = { stock: newStock };

        if (Number.isFinite(selectedMl) && selectedMl > 0) {
            let found = false;
            const nextOptions = baseOptions.map((row) => {
                if (Number(row?.ml) === Number(selectedMl)) {
                    found = true;
                    return { ...row, stock: newStock };
                }
                return row;
            });
            if (!found) {
                nextOptions.push({
                    ml: Math.floor(selectedMl),
                    price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
                    price_wholesale:
                        Number.isFinite(Number(product.price_wholesale)) && Number(product.price_wholesale) > 0
                            ? Number(product.price_wholesale)
                            : null,
                    stock: newStock,
                });
                nextOptions.sort(sortVolumeOptions);
            }
            payload = { volume_options: normalizeVolumeOptions(nextOptions) };
            nextProductPatch = { volume_options: nextOptions };
        }

        try {
            const res = await fetch(`${API}/admin/products/${editingStockId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(`No se pudo actualizar el stock: ${data?.error || res.statusText}`);
                return;
            }

            setProducts((prev) =>
                prev.map((x) => (x.id === editingStockId ? { ...x, ...nextProductPatch } : x))
            );

            cancelEditStock();
        } catch (e) {
            console.error(e);
            alert("Error actualizando el stock");
        }
    };


    const cancelEditWholesale = () => {
        setEditingWholesaleId(null);
        setEditingWholesale("");
    };



    const uploadImage = async (file, { asMain = false } = {}) => {
        setUploadingImage(true);
        setUploadingImageLabel(asMain ? "Subiendo imagen principal..." : "Subiendo imagen...");

        try {
            const fd = new FormData();
            fd.append("image", file);
            if (form?.id) fd.append("product_id", String(form.id)); // asocia a producto
            if (asMain) fd.append("as_main", "1");                   // marcar como principal en backend

            const res = await fetch(`${API}/admin/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            const data = await res.json();
            if (!res.ok || !data?.url) throw new Error(data?.error || "No se pudo subir");

            // Refresca estado local: suma a galería y opcionalmente setea principal
            setForm((prev) => {
                if (!prev) return prev;
                const u = normalizeImagePath(data.url);
                const cleanedGallery = (prev.image_urls || []).filter((img) => !isDefaultImage(img));
                return {
                    ...prev,
                    image_url: (asMain || !prev.image_url || isDefaultImage(prev.image_url)) ? u : prev.image_url,
                    image_urls: uniqPush(cleanedGallery, u),
                };
            });
        } catch (e) {
            console.error(e);
            alert("No se pudo subir la imagen");
        } finally {
            setUploadingImage(false);
            setUploadingImageLabel("");
        }
    };

    const deleteSelectedImage = async () => {
        if (!form) return;
        if (!form.id) {
            alert("Primero guardá el producto para poder borrar su imagen.");
            return;
        }

        const selectedUrl = String(form.image_url || "");
        const imageId = extractImageId(selectedUrl);

        if (!confirm("¿Eliminar la foto seleccionada? Esta acción no se puede deshacer.")) return;

        try {
            if (imageId) {
                // ===== Caso imagen interna (/public/img/<id>): borrar en backend =====
                const res = await fetch(`${API}/admin/images/${imageId}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    alert(`No se pudo eliminar la imagen: ${data?.error || res.statusText}`);
                    return;
                }

                // Actualizar estado local
                setForm(prev => {
                    if (!prev) return prev;
                    const deletedUrl = `/public/img/${imageId}`;
                    const nextGallery = (prev.image_urls || []).filter(u => normalizeImagePath(u) !== deletedUrl);
                    let nextMain = prev.image_url;
                    if (normalizeImagePath(prev.image_url) === deletedUrl) {
                        nextMain = nextGallery[0] || sinImagen; // 👈 fallback correcto
                    }
                    return { ...prev, image_urls: nextGallery, image_url: nextMain };
                });

            } else {
                // ===== Caso imagen externa (scraping, http/https): "borrar" = limpiar campo =====
                // 1) Actualizar en backend el producto, dejando image_url vacío
                const res = await fetch(`${API}/admin/products/${form.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ image_url: "" }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    alert(`No se pudo limpiar la imagen: ${data?.error || res.statusText}`);
                    return;
                }

                // 2) Actualizar estado local: sacar la URL seleccionada de la galería (si estaba) y poner sinImagen
                setForm(prev => {
                    if (!prev) return prev;
                    const target = normalizeImagePath(selectedUrl);
                    const nextGallery = (prev.image_urls || []).filter(u => normalizeImagePath(u) !== target);
                    return { ...prev, image_urls: nextGallery, image_url: sinImagen };
                });
            }
        } catch (e) {
            console.error(e);
            alert("Error eliminando la imagen");
        }
    };

    const shouldShowFlavors = () => false

    const doSaveProduct = async () => {
        if (productSaveInFlightRef.current) return;
        productSaveInFlightRef.current = true;
        setSavingProduct(true);
        try {
            const method = form.id ? "PUT" : "POST"
            const url = form.id ? `${API}/admin/products/${form.id}` : `${API}/admin/products`
            if (Boolean(form.is_home_featured)) {
                const homeCount = products.filter((item) => item?.is_home_featured && item.id !== form.id).length;
                if (homeCount >= 12) {
                    alert("Solo podés seleccionar hasta 12 productos para Inicio.");
                    return;
                }
            }

            // Normalizamos catálogo
            const catalog = (form.flavor_catalog || []).map((x) => ({
                name: String(x?.name ?? "").trim(),
                active: Boolean(x?.active ?? true),
                stock: Number.isFinite(Number(x?.stock)) ? Number(x.stock) : 0,
            }))

            const activeFlavors = catalog.filter((x) => x.active).map((x) => x.name)
            const enabled = shouldShowFlavors(form.category_id) && activeFlavors.length > 0

            // 🔒 Sanitiza y evita valores tipo "frutal" que causarían GET /frutal
            const normalizedImageUrl = (() => {
                const u = String(form.image_url || "").trim();
                if (!u) return "";
                if (/^https?:\/\//i.test(u)) return u;        // URL completa OK
                if (u.startsWith("/")) return normalizeImagePath(u); // relativo válido → normaliza /public
                return "";                                     // invalida textos sueltos (evita 404 /frutal)
            })();
            const { image_urls, volume_stock, ...cleanForm } = form;
            const allVolumeOptions = normalizeVolumeOptions(form.volume_options || [], { keepWithoutMl: true });
            const fallbackRetail = Number(
                allVolumeOptions.find((row) => Number(row?.price) > 0)?.price
            );
            const fallbackWholesale = Number(
                allVolumeOptions.find((row) => Number(row?.price_wholesale) > 0)?.price_wholesale
            );
            const stockFromVolumes = allVolumeOptions.reduce(
                (acc, row) => acc + (Number.isFinite(Number(row?.stock)) ? Number(row.stock) : 0),
                0
            );
            const finalStock = allVolumeOptions.length > 0
                ? stockFromVolumes
                : Number(form.stock ?? 0);
            const directRetail = parseFlexibleDecimal(form.price);
            const directWholesale = parseFlexibleDecimal(form.price_wholesale);
            const payload = {
                ...cleanForm,
                price:
                    Number.isFinite(directRetail) && directRetail > 0
                        ? directRetail
                        : (Number.isFinite(fallbackRetail) && fallbackRetail > 0 ? fallbackRetail : 0),
                price_wholesale:
                    Number.isFinite(directWholesale) && directWholesale > 0
                        ? directWholesale
                        : (Number.isFinite(fallbackWholesale) && fallbackWholesale > 0 ? fallbackWholesale : null),
                volume_ml:
                    form.volume_ml !== "" && form.volume_ml !== null && form.volume_ml !== undefined && !isNaN(Number(form.volume_ml))
                        ? Math.max(0, Math.floor(Number(form.volume_ml)))
                        : null,
                volume_options: normalizeVolumeOptions(form.volume_options || []),


                image_url: normalizedImageUrl,
                short_description: form.short_description ?? "",

                flavors: [],
                flavor_enabled: false,
                flavor_catalog: [],
                stock: finalStock,
                flavor_stock_mode: false,
            }


            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(`Error: ${json.error || "No se pudo guardar el producto"}`);
                return;
            }

            // ✅ Si es creación, ATAMOS las imágenes subidas antes de tener id
            if (!form.id) {
                const newProduct = json.product; // tu create_product devuelve { product: ... }
                const newId = newProduct?.id;
                if (newId) {
                    // Extraer ids de URLs tipo "/public/img/123"
                    const ids = Array.isArray(form.image_urls)
                        ? form.image_urls
                            .map(u => {
                                const m = String(u || "").match(/\/public\/img\/(\d+)/);
                                return m ? parseInt(m[1], 10) : null;
                            })
                            .filter(Boolean)
                        : [];

                    // main_id desde la imagen principal seleccionada en el form
                    let mainId = null;
                    if (form.image_url) {
                        const m = String(form.image_url).match(/\/public\/img\/(\d+)/);
                        if (m) mainId = parseInt(m[1], 10);
                    }

                    if (ids.length > 0) {
                        await fetch(`${API}/admin/products/${newId}/attach-images`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ image_ids: ids, main_id: mainId }),
                        }).catch(() => { });
                    }
                }
            }

            const selectedCategoryName =
                ID_TO_CATEGORY_NAME[payload.category_id] || "Sin categoría";
            const action = form.id ? "actualizado" : "creado";

            setForm(null);
            fetchAll();
            setSaveSuccessModal({
                open: true,
                action,
                category: selectedCategoryName,
            });

        } catch (error) {
            console.error("Error saving product:", error);
            alert("Error al guardar producto");
        } finally {
            productSaveInFlightRef.current = false;
            setSavingProduct(false);
        }
    };

    const continueSaveFlow = async () => {
        const variantStock = normalizeVolumeOptions(form?.volume_options || [], { keepWithoutMl: true })
            .reduce((acc, row) => acc + (Number.isFinite(Number(row?.stock)) ? Number(row.stock) : 0), 0);
        const stock = (form?.volume_options || []).length > 0
            ? variantStock
            : Math.max(0, Math.floor(Number(form?.stock) || 0));
        if (stock === 0) {
            setShowZeroStockModal(true);
            return;
        }
        await doSaveProduct();
    };

    const save = async (e) => {
        e.preventDefault();
        const hasConfiguredRows =
            normalizeVolumeOptions(form?.volume_options || [], { keepWithoutMl: true }).length > 0;
        if (!hasConfiguredRows) {
            setShowMissingPricingModal(true);
            return;
        }
        await continueSaveFlow();
    };

    const getMlOptionsForTable = (p) => {
        const options = normalizeVolumeOptions(p?.volume_options || [], { keepWithoutMl: true });
        if (options.length > 0) return options.sort(sortVolumeOptions);

        const fallbackMl = Number(p?.volume_ml);
        if (Number.isFinite(fallbackMl) && fallbackMl > 0) {
            return [{
                ml: Math.floor(fallbackMl),
                price: Number.isFinite(Number(p?.price)) ? Number(p.price) : 0,
                stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : 0,
                price_wholesale:
                    Number.isFinite(Number(p?.price_wholesale)) && Number(p.price_wholesale) > 0
                        ? Number(p.price_wholesale)
                        : null,
            }];
        }

        return [{
            ml: null,
            price: Number.isFinite(Number(p?.price)) ? Number(p.price) : 0,
            stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : 0,
            price_wholesale:
                Number.isFinite(Number(p?.price_wholesale)) && Number(p.price_wholesale) > 0
                    ? Number(p.price_wholesale)
                    : null,
        }];
    };

    const getDefaultMlKey = (p) => {
        const options = getMlOptionsForTable(p);
        const firstWithMl = options.find((x) => Number.isFinite(Number(x?.ml)) && Number(x.ml) > 0);
        return firstWithMl ? String(Number(firstWithMl.ml)) : "sin_ml";
    };

    const getSelectedMlKey = (p) => selectedMlByProduct[p.id] ?? getDefaultMlKey(p);

    const getSelectedPriceOption = (p) => {
        const options = getMlOptionsForTable(p);
        const key = getSelectedMlKey(p);
        return options.find((x) => (Number.isFinite(Number(x?.ml)) && Number(x.ml) > 0 ? String(Number(x.ml)) : "sin_ml") === key)
            || options[0];
    };

    const getBudgetSelection = (productId) => {
        const current = budgetSelections[productId] || {};
        const quantity = Math.max(1, Number(current.quantity) || 1);
        return {
            checked: Boolean(current.checked),
            quantity,
        };
    };

    const updateBudgetSelection = (productId, patch) => {
        setBudgetSelections((prev) => {
            const current = prev[productId] || { checked: false, quantity: 1 };
            return {
                ...prev,
                [productId]: {
                    ...current,
                    ...patch,
                    quantity: Math.max(1, Number((patch && patch.quantity) ?? current.quantity) || 1),
                },
            };
        });
    };

    const selectedBudgetItems = useMemo(() => {
        return products
            .filter((product) => getBudgetSelection(product.id).checked)
            .map((product) => {
                const selectedOption = getSelectedPriceOption(product);
                const quantity = getBudgetSelection(product.id).quantity;
                const mlValue =
                    Number.isFinite(Number(selectedOption?.ml)) && Number(selectedOption.ml) > 0
                        ? Number(selectedOption.ml)
                        : null;

                return {
                    id: product.id,
                    name: product.name,
                    quantity,
                    ml: mlValue,
                    mlLabel: mlValue ? `${mlValue} ML` : "Sin ML",
                    retailPrice: Number.isFinite(Number(selectedOption?.price)) ? Number(selectedOption.price) : 0,
                    wholesalePrice:
                        Number.isFinite(Number(selectedOption?.price_wholesale)) && Number(selectedOption.price_wholesale) > 0
                            ? Number(selectedOption.price_wholesale)
                            : 0,
                };
            });
    }, [products, budgetSelections, selectedMlByProduct]);

    const selectedBudgetCount = selectedBudgetItems.length;

    const filtered = products.filter((p) => {
        const matchesSearch =
            !q ||
            p.name?.toLowerCase().includes(q.toLowerCase()) ||
            p.brand?.toLowerCase().includes(q.toLowerCase());

        const selectedCategoryKey = normalizeCategoryLabel(selectedCategory);
        const matchesCategory =
            selectedCategory === "Todos" ||
            (selectedCategoryKey === "inicio" && Boolean(p?.is_home_featured)) ||
            (selectedCategoryKey === "mas vendidos" && (Boolean(p?.is_best_seller) || Number(p?.category_id) === 8)) ||
            normalizeCategoryLabel(ID_TO_CATEGORY_NAME[p.category_id]) === selectedCategoryKey; // 👈

        const isActive = Boolean(p?.is_active);
        const matchesStatus =
            selectedStatus === "todos" ||
            (selectedStatus === "activos" && isActive) ||
            (selectedStatus === "inactivos" && !isActive);

        const productStock = Number.isFinite(Number(p?.stock)) ? Number(p.stock) : 0;
        const matchesStock =
            selectedStockFilter === "todos" ||
            (selectedStockFilter === "sin_stock" && productStock === 0) ||
            (selectedStockFilter === "stock_bajo" && productStock > 0 && productStock <= 5);
        const matchesBudget =
            !budgetMode ||
            budgetFilter !== "selected" ||
            getBudgetSelection(p.id).checked;

        return matchesSearch && matchesCategory && matchesStatus && matchesStock && matchesBudget;
    });

    const activeFilters = [
        q.trim()
            ? { key: "search", label: `Busqueda: ${q.trim()}`, onClear: () => setQ("") }
            : null,
        selectedCategory !== "Todos"
            ? { key: "category", label: `Categoria: ${selectedCategory}`, onClear: () => setSelectedCategory("Todos") }
            : null,
        selectedStatus !== "todos"
            ? {
                key: "status",
                label: `Estado: ${selectedStatus === "activos" ? "Activos" : "Inactivos"}`,
                onClear: () => setSelectedStatus("todos"),
            }
            : null,
        selectedStockFilter !== "todos"
            ? {
                key: "stock",
                label: `Stock: ${selectedStockFilter === "sin_stock" ? "Sin stock" : "Stock bajo"}`,
                onClear: () => setSelectedStockFilter("todos"),
            }
            : null,
        budgetMode && budgetFilter === "selected"
            ? {
                key: "budget",
                label: "Presupuesto: seleccionados",
                onClear: () => setBudgetFilter("all"),
            }
            : null,
    ].filter(Boolean);

    const hasActiveFilters = activeFilters.length > 0;

    const clearAllFilters = () => {
        setQ("");
        setSelectedCategory("Todos");
        setSelectedStatus("todos");
        setSelectedStockFilter("todos");
        setBudgetFilter("all");
    };


    // 👇 Sincroniza el stock general cuando el modo por sabor está activo
    /*  useEffect(() => {
         if (!form) return
         if (form.flavor_stock_mode) {
             const total = sumActiveFlavorStock(form.flavor_catalog || [])
             if (Number(form.stock) !== total) {
                 setForm(prev => ({ ...prev, stock: total }))
             }
         }
     }, [form?.flavor_catalog, form?.flavor_stock_mode]) */


    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl font-bold mb-4 text-center">Admin Productos</h1>

            {/* Barra superior */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-4">
                <div className={`flex flex-col min-w-0 ${budgetMode ? "sm:basis-full sm:order-last" : "flex-1"}`}>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Buscar
                    </label>
                    <input
                        type="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        placeholder="Buscar por nombre o marca"
                        className="w-full border rounded px-3 py-2"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onSearch={() => {
                            scrollToResults();
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            e.currentTarget.blur();
                            scrollToResults();
                        }}
                    />
                </div>

                <div className="flex flex-col min-w-0">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Categorias
                    </label>
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="border rounded px-3 py-2 sm:w-48"
                    >
                        <option value="Todos">Todas las categorías</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col min-w-0">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Estado
                    </label>
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="border rounded px-3 py-2 sm:w-44"
                    >
                        <option value="todos">Ver todos</option>
                        <option value="activos">Ver activos</option>
                        <option value="inactivos">Ver inactivos</option>
                    </select>
                </div>
                <div className="flex flex-col min-w-0">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Stock
                    </label>
                    <select
                        value={selectedStockFilter}
                        onChange={(e) => setSelectedStockFilter(e.target.value)}
                        className="border rounded px-3 py-2 sm:w-44"
                    >
                        <option value="todos">Ver todos</option>
                        <option value="sin_stock">Ver sin stock</option>
                        <option value="stock_bajo">Ver stock bajo</option>
                    </select>
                </div>
                <AdminBudgetToolbar
                    isActive={budgetMode}
                    selectedCount={selectedBudgetCount}
                    budgetFilter={budgetFilter}
                    onBudgetFilterChange={setBudgetFilter}
                    onStart={() => {
                        setBudgetMode(true);
                        setBudgetFilter("all");
                    }}
                    onConfirm={() => {
                        if (selectedBudgetCount === 0) return;
                        setBudgetModalOpen(true);
                    }}
                    onCancel={() => {
                        setBudgetMode(false);
                        setBudgetFilter("all");
                        setBudgetSelections({});
                        setBudgetModalOpen(false);
                    }}
                />
                <button
                    onClick={() => setForm({
                        category_id: 1,
                        is_active: true,
                        is_best_seller: false,
                        is_home_featured: false,

                        image_url: "",
                        image_urls: [],

                        price: "",
                        price_wholesale: "",
                        volume_ml: "",
                        volume_stock: "",
                        volume_options: [],
                        stock: 0,
                    })}


                    className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
                >
                    Nuevo
                </button>
                {/* <button
                    onClick={() => fetchAll()}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    title="Actualizar datos desde el servidor"
                >
                    🔄 Refrescar
                </button> */}

                <Link
                    to="/admin/pedidos"
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 inline-block text-center"
                >
                    Ver pedidos
                </Link>


                {/* Importar JSON */}
                {/*  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                >
                    Importar JSON
                </button> */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        try {
                            const text = await file.text()
                            const raw = JSON.parse(text) // array del scraper

                            // === 👇 Normalización de nombres para evitar duplicados "similares" ===
                            const cleanName = (n) => n.replace(/\s+/g, " ").trim().toLowerCase()
                            const existingNames = new Set(products.map((p) => cleanName(p.name)))

                            const transformed = (raw || [])
                                .filter((it) => !existingNames.has(cleanName(it.name || "")))
                                .map((it) => {
                                    const catId = it.category_id || mapCategoryIdFromName(it.category_name)
                                    const catalog = (it.flavors || []).map((f) => ({ name: String(f), active: true, stock: 0 })) // activos + stock 0
                                    return {
                                        id: undefined,
                                        name: it.name || "",
                                        description: it.description || "", // ✅ traer descripción real
                                        short_description: it.short_description || "", // ✅ traer short description real
                                        brand: it.brand || "",
                                        price: it.price || 0,
                                        stock: it.stock || 0,
                                        image_url: it.image_url || "",
                                        category_id: catId,
                                        category_name: ID_TO_CATEGORY_NAME[catId] || "Masculinos",
                                        flavor_enabled: catalog.length > 0,
                                        flavor_catalog: catalog, // ✅ catálogo completo para edición
                                        flavors: catalog.map((x) => x.name), // ✅ todos los sabores como activos por defecto
                                        flavor_stock_mode: false, // por defecto
                                        is_active: true,
                                        source_url: it.source_url || "",
                                    }
                                })

                            // === 👆 Fin de normalización ===

                            setImportPreview(transformed)
                            setImportOpen(true)
                        } catch (err) {
                            console.error(err)
                            alert("No se pudo leer el JSON")
                        } finally {
                            e.target.value = ""
                        }
                    }}
                />
            </div>

            {hasActiveFilters && (
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                    <div className="text-xs font-semibold text-amber-950 bg-amber-200/80 border border-amber-300 rounded-md px-2.5 py-1 whitespace-nowrap"
                    >
                        Filtros activos
                    </div>
                    <div className="flex flex-wrap gap-2 min-w-0">
                        {activeFilters.map((item) => (
                            <div
                                key={item.key}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-amber-300 pl-2.5 pr-1.5 py-1 text-xs font-medium text-amber-800"
                            >
                                <span>{item.label}</span>
                                <button
                                    type="button"
                                    onClick={item.onClear}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                                    aria-label={`Quitar filtro ${item.label}`}
                                    title={`Quitar ${item.label}`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={clearAllFilters}
                        className="text-xs font-medium text-white bg-amber-700 hover:bg-amber-600 border border-amber-500 rounded-md px-2.5 py-1 transition-colors whitespace-nowrap"
                    >
                        Limpiar filtros
                    </button>
                    <div className="text-right text-[11px] text-amber-800/80 leading-tight sm:ml-auto whitespace-nowrap">
                        {filtered.length} {filtered.length === 1 ? "producto" : "productos"} en página
                    </div>
                </div>
            )}

            {!hasActiveFilters && (
                <div className="mb-4 text-right text-[11px] text-gray-500 leading-tight">
                    {filtered.length} {filtered.length === 1 ? "producto" : "productos"} en página
                </div>
            )}

            {/* Tabla */}
            <div ref={resultsRef} className="overflow-x-auto">
                <table className="w-full text-sm border">
                    <thead className="bg-gray-50">
                        <tr>
                            {budgetMode && (
                                <>
                                    <th className="w-10 p-2 text-center"></th>
                                    <th className="w-28 p-2 text-center">Cant.</th>
                                </>
                            )}
                            <th className="p-2 text-left">Producto</th>
                            <th className="hidden p-2 text-left md:table-cell">Descripción corta</th>
                            <th className="hidden p-2 text-left md:table-cell">Descripción larga</th>
                            <th className="p-2 text-center">ML</th>
                            <th className="p-2">
                                <span className="md:hidden">Min</span>
                                <span className="hidden md:inline">Precio minorista</span>
                            </th>

                            <th className="p-2">
                                <span className="md:hidden">May</span>
                                <span className="hidden md:inline">Precio<br /> Mayorista</span>
                            </th>

                            <th className="hidden p-2 md:table-cell">Stock</th>
                            <th className="hidden p-2 md:table-cell">Categoría</th>
                            {/*  <th className="p-2">Sabores</th> */}
                            <th className="hidden p-2 md:table-cell">Mas Vendidos</th>
                            <th className="hidden p-2 md:table-cell">Estado</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => {
                            const mlOptions = getMlOptionsForTable(p);
                            const selectedOption = getSelectedPriceOption(p);
                            const retailShown = Number.isFinite(Number(selectedOption?.price)) ? Number(selectedOption.price) : 0;
                            const wholesaleShown =
                                Number.isFinite(Number(selectedOption?.price_wholesale)) && Number(selectedOption.price_wholesale) > 0
                                    ? Number(selectedOption.price_wholesale)
                                    : null;
                            const stockShown =
                                Number.isFinite(Number(selectedOption?.stock))
                                    ? Number(selectedOption.stock)
                                    : (Number.isFinite(Number(p?.stock)) ? Number(p.stock) : 0);
                            const isMobileExpanded = expandedMobileProductId === p.id;
                            const tableColSpan = budgetMode ? 14 : 12;

                            return (
                                <Fragment key={p.id}>
                                    <tr className="border-t">
                                        {budgetMode && (
                                            <AdminBudgetSelectionCell
                                                checked={getBudgetSelection(p.id).checked}
                                                quantity={getBudgetSelection(p.id).quantity}
                                                onCheckedChange={(checked) => updateBudgetSelection(p.id, { checked })}
                                                onQuantityChange={(quantity) => updateBudgetSelection(p.id, { quantity })}
                                            />
                                        )}
                                        <td className="p-2">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedMobileProductId((prev) => (prev === p.id ? null : p.id))}
                                                className="flex w-full items-start justify-between gap-2 text-left md:block"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-medium">{p.name}</div>
                                                    {p.brand && <div className="text-gray-500 text-xs">{p.brand}</div>}
                                                </div>
                                                <span className="text-xs text-gray-400 md:hidden">{isMobileExpanded ? "Ocultar" : "Ver"}</span>
                                            </button>
                                        </td>
                                        <td className="hidden p-2 max-w-xs text-center md:table-cell">
                                            {stripHtml(p.description)
                                                ? <span className="font-semibold text-green-600">✓</span>
                                                : <span className="text-gray-400">x</span>}
                                        </td>
                                        <td className="hidden p-2 max-w-xs text-center md:table-cell">
                                            {stripHtml(p.short_description)
                                                ? <span className="font-semibold text-green-600">✓</span>
                                                : <span className="text-gray-400">x</span>}
                                        </td>
                                        <td className="p-2 text-center">
                                            <select
                                                value={getSelectedMlKey(p)}
                                                onChange={(e) =>
                                                    setSelectedMlByProduct((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                }
                                                className="border rounded px-2 py-1 text-xs sm:text-sm min-w-[84px] md:min-w-[96px]"
                                            >
                                                {mlOptions.map((opt) => {
                                                    const key =
                                                        Number.isFinite(Number(opt?.ml)) && Number(opt.ml) > 0
                                                            ? String(Number(opt.ml))
                                                            : "sin_ml";
                                                    return (
                                                        <option key={`${p.id}-${key}`} value={key}>
                                                            {key === "sin_ml" ? "Sin ML" : `${key} ML`}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </td>
                                        <td className="p-2">
                                            {editingPriceId === p.id ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <input
                                                        className="w-20 md:w-24 border rounded px-2 py-1 text-right tabular-nums"
                                                        type="text"
                                                        inputMode="decimal"
                                                        autoFocus
                                                        value={editingPrice ?? ""}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.replace(/[^\d,.\s]/g, "");
                                                            setEditingPrice(raw);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") confirmEditPrice();
                                                            if (e.key === "Escape") cancelEditPrice();
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-green-50"
                                                        title="Guardar"
                                                        onClick={confirmEditPrice}
                                                    >
                                                        ✅
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-gray-50"
                                                        title="Cancelar"
                                                        onClick={cancelEditPrice}
                                                    >
                                                        ❌
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2">
                                                    <span className="whitespace-nowrap tabular-nums">$ {Number(retailShown).toLocaleString("es-AR")}</span>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-gray-50"
                                                        title="Editar precio"
                                                        onClick={() => startEditPrice(p, retailShown)}
                                                    >
                                                        ✏️
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-2">
                                            {editingWholesaleId === p.id ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <input
                                                        className="w-20 md:w-24 border rounded px-2 py-1 text-right tabular-nums"
                                                        type="text"
                                                        inputMode="decimal"
                                                        autoFocus
                                                        value={editingWholesale ?? ""}
                                                        onChange={(e) => setEditingWholesale(e.target.value.replace(/[^\d,.\s]/g, ""))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") confirmEditWholesale();
                                                            if (e.key === "Escape") cancelEditWholesale();
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-green-50"
                                                        onClick={confirmEditWholesale}
                                                    >
                                                        ✅
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-gray-50"
                                                        onClick={cancelEditWholesale}
                                                    >
                                                        ❌
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2">
                                                    <span className="whitespace-nowrap tabular-nums">
                                                        {wholesaleShown ? `$ ${formatPrice(wholesaleShown)}` : "—"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-gray-50"
                                                        onClick={() => startEditWholesale(p, wholesaleShown)}
                                                    >
                                                        ✏️
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="hidden p-2 text-center md:table-cell">
                                            {editingStockId === p.id ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <input
                                                        className="w-20 border rounded px-2 py-1 text-right"
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        inputMode="numeric"
                                                        autoFocus
                                                        value={editingStock}
                                                        onChange={(e) => setEditingStock(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") confirmEditStock();
                                                            if (e.key === "Escape") cancelEditStock();
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-green-50"
                                                        onClick={confirmEditStock}
                                                    >
                                                        ✅
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-red-50"
                                                        onClick={cancelEditStock}
                                                    >
                                                        ✖️
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2">
                                                    <span>{stockShown}</span>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded hover:bg-gray-50"
                                                        onClick={() => startEditStock(p, stockShown)}
                                                    >
                                                        ✏️
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="hidden p-2 text-center md:table-cell">{ID_TO_CATEGORY_NAME[p.category_id]}</td>
                                        <td className="hidden p-2 text-center md:table-cell">
                                            <div className="inline-flex items-center justify-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(p?.is_home_featured)}
                                                    onChange={() => toggleHomeFeatured(p)}
                                                    className="h-5 w-5 cursor-pointer"
                                                    style={{ accentColor: "#2563eb" }}
                                                    title="Mostrar en Inicio"
                                                    aria-label="Mostrar en Inicio"
                                                />
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(p?.is_best_seller)}
                                                    onChange={() => toggleBestSeller(p)}
                                                    className="h-5 w-5 cursor-pointer"
                                                    style={{ accentColor: "#16a34a" }}
                                                    title="Mostrar en Mas Vendidos"
                                                    aria-label="Mostrar en Mas Vendidos"
                                                />
                                            </div>
                                        </td>
                                        <td className="hidden p-2 text-center md:table-cell">
                                            {/* Toggle visual Estado con aviso solo en filtro activos/inactivos */}
                                            <button
                                                type="button"
                                                aria-label={p.is_active ? "Desactivar producto" : "Activar producto"}
                                                disabled={changingStatusId === p.id}
                                                onClick={async () => {
                                                    const nextActive = !p.is_active;
                                                    const isStatusFilter = selectedStatus === 'activos' || selectedStatus === 'inactivos';
                                                    if (isStatusFilter) {
                                                        setChangingStatusId(p.id);
                                                        setChangingStatusMsg(`Cambiando producto a ${nextActive ? 'activo' : 'inactivo'}...`);
                                                    }
                                                    try {
                                                        const res = await fetch(`${API}/admin/products/${p.id}`, {
                                                            method: "PUT",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                Authorization: `Bearer ${token}`,
                                                            },
                                                            body: JSON.stringify({ is_active: nextActive }),
                                                        });
                                                        if (!res.ok) {
                                                            const data = await res.json().catch(() => ({}));
                                                            alert(`No se pudo actualizar el estado: ${data?.error || res.statusText}`);
                                                            setChangingStatusId(null);
                                                            setChangingStatusMsg("");
                                                            return;
                                                        }
                                                        if (isStatusFilter) {
                                                            setChangingStatusMsg(`Cambiando producto a ${nextActive ? 'activo' : 'inactivo'}...`);
                                                            setTimeout(() => {
                                                                setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: nextActive } : prod));
                                                                setChangingStatusId(null);
                                                                setChangingStatusMsg("");
                                                            }, 2000);
                                                        } else {
                                                            setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: nextActive } : prod));
                                                        }
                                                    } catch {
                                                        alert("Error actualizando estado");
                                                        setChangingStatusId(null);
                                                        setChangingStatusMsg("");
                                                    }
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    border: 'none',
                                                    background: 'none',
                                                    cursor: changingStatusId === p.id ? 'not-allowed' : 'pointer',
                                                    padding: 0,
                                                    margin: 0,
                                                }}
                                            >
                                                <span style={{
                                                    display: 'inline-block',
                                                    width: 38,
                                                    height: 22,
                                                    borderRadius: 12,
                                                    background: p.is_active ? '#bbf7d0' : '#fecaca',
                                                    position: 'relative',
                                                    transition: 'background 0.2s',
                                                    marginRight: 8,
                                                }}>
                                                    <span style={{
                                                        position: 'absolute',
                                                        left: p.is_active ? 18 : 2,
                                                        top: 2,
                                                        width: 18,
                                                        height: 18,
                                                        borderRadius: '50%',
                                                        background: p.is_active ? '#059669' : '#b91c1c',
                                                        transition: 'left 0.2s, background 0.2s',
                                                    }} />
                                                </span>
                                                <span style={{
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: p.is_active ? '#059669' : '#b91c1c',
                                                    minWidth: 54,
                                                    textAlign: 'left',
                                                }}>
                                                    {p.is_active ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </button>
                                            {/* Aviso de cambio de estado (portal, siempre visible, sobre header) */}
                                            {changingStatusId && changingStatusMsg && createPortal(
                                                <div style={{
                                                    position: 'fixed',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100vw',
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    zIndex: 99999,
                                                    pointerEvents: 'none',
                                                }}>
                                                    <div style={{
                                                        marginTop: 12,
                                                        background: '#fbbf24',
                                                        color: '#78350f',
                                                        padding: '10px 24px',
                                                        borderRadius: 8,
                                                        fontWeight: 600,
                                                        fontSize: 16,
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                                        pointerEvents: 'auto',
                                                        maxWidth: '90vw',
                                                        textAlign: 'center',
                                                    }}>
                                                        {changingStatusMsg}
                                                    </div>
                                                </div>,
                                                document.body
                                            )}
                                        </td>
                                        <td className="p-2 text-right">
                                            <button
                                                onClick={() => {
                                                    let catalog = Array.isArray(p.flavor_catalog) ? p.flavor_catalog : [];
                                                    if ((!catalog || catalog.length === 0) && Array.isArray(p.flavors) && p.flavors.length > 0) {
                                                        catalog = p.flavors.map((n) => ({ name: n, active: true, stock: 0 }));
                                                    }
                                                    if (!Array.isArray(catalog)) catalog = [];

                                                    const flavorStockMode = Boolean(p?.flavor_stock_mode ?? false);
                                                    const sum = sumActiveFlavorStock(catalog);
                                                    const safeImage = (p.image_url && String(p.image_url).trim())
                                                        ? p.image_url
                                                        : "";
                                                    let safeGallery = Array.isArray(p.image_urls) ? p.image_urls : [];
                                                    safeGallery = safeGallery.filter((u) => !isDefaultImage(u));
                                                    if (safeImage && !isDefaultImage(safeImage)) {
                                                        safeGallery = uniqPush(safeGallery, safeImage);
                                                    }

                                                    setForm({
                                                        ...p,
                                                        category_id: Number(p.category_id) === 6 ? 1 : p.category_id,
                                                        price: "",
                                                        price_wholesale: "",
                                                        volume_ml: "",
                                                        volume_stock: "",
                                                        volume_options: getMlOptionsForTable(p),
                                                        image_url: safeImage,
                                                        image_urls: safeGallery,
                                                        flavor_catalog: catalog,
                                                        flavor_enabled: p.flavor_enabled ?? (catalog.length > 0),
                                                        flavor_stock_mode: flavorStockMode,
                                                        stock: flavorStockMode ? sum : (Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0),
                                                    });
                                                }}
                                                className="px-3 py-1 border rounded hover:bg-gray-50"
                                            >
                                                Editar
                                            </button>
                                        </td>
                                    </tr>
                                    {isMobileExpanded && (
                                        <tr className="border-t bg-gray-50 md:hidden">
                                            <td colSpan={tableColSpan} className="p-3">
                                                <div className="grid grid-cols-[max-content,max-content] justify-start gap-x-4 gap-y-3 text-sm">
                                                    <div>
                                                        <div className="text-xs uppercase tracking-wide text-gray-500">Stock</div>
                                                        <div className="mt-1">
                                                            {editingStockId === p.id ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        className="w-20 border rounded px-2 py-1 text-right"
                                                                        type="number"
                                                                        min={0}
                                                                        step={1}
                                                                        inputMode="numeric"
                                                                        autoFocus
                                                                        value={editingStock}
                                                                        onChange={(e) => setEditingStock(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === "Enter") confirmEditStock();
                                                                            if (e.key === "Escape") cancelEditStock();
                                                                        }}
                                                                    />
                                                                    <button type="button" className="px-2 py-1 border rounded hover:bg-green-50" onClick={confirmEditStock}>✅</button>
                                                                    <button type="button" className="px-2 py-1 border rounded hover:bg-red-50" onClick={cancelEditStock}>✖️</button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <span>{stockShown}</span>
                                                                    <button
                                                                        type="button"
                                                                        className="px-2 py-1 border rounded hover:bg-gray-50"
                                                                        onClick={() => startEditStock(p, stockShown)}
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs uppercase tracking-wide text-gray-500">Categoria</div>
                                                        <div className="mt-1">{ID_TO_CATEGORY_NAME[p.category_id]}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs uppercase tracking-wide text-gray-500">Mas Vendidos</div>
                                                        <div className="mt-1 inline-flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(p?.is_home_featured)}
                                                                onChange={() => toggleHomeFeatured(p)}
                                                                className="h-5 w-5 cursor-pointer"
                                                                style={{ accentColor: "#2563eb" }}
                                                                title="Mostrar en Inicio"
                                                                aria-label="Mostrar en Inicio"
                                                            />
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(p?.is_best_seller)}
                                                                onChange={() => toggleBestSeller(p)}
                                                                className="h-5 w-5 cursor-pointer"
                                                                style={{ accentColor: "#16a34a" }}
                                                                title="Mostrar en Mas Vendidos"
                                                                aria-label="Mostrar en Mas Vendidos"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs uppercase tracking-wide text-gray-500">Desc. corta</div>
                                                        <div className="mt-1">
                                                            {stripHtml(p.description)
                                                                ? <span className="font-semibold text-green-600">✓</span>
                                                                : <span className="text-gray-400">x</span>}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs uppercase tracking-wide text-gray-500">Desc. larga</div>
                                                        <div className="mt-1">
                                                            {stripHtml(p.short_description)
                                                                ? <span className="font-semibold text-green-600">✓</span>
                                                                : <span className="text-gray-400">x</span>}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="text-xs uppercase tracking-wide text-gray-500">Estado</div>
                                                        <div className="mt-1">
                                                            {/* Toggle visual Estado móvil */}
                                                            <button
                                                                type="button"
                                                                aria-label={p.is_active ? "Desactivar producto" : "Activar producto"}
                                                                disabled={changingStatusId === p.id}
                                                                onClick={async () => {
                                                                    const nextActive = !p.is_active;
                                                                    const isStatusFilter = selectedStatus === 'activos' || selectedStatus === 'inactivos';
                                                                    if (isStatusFilter) {
                                                                        setChangingStatusId(p.id);
                                                                        setChangingStatusMsg(`Cambiando producto a ${nextActive ? 'activo' : 'inactivo'}...`);
                                                                    }
                                                                    try {
                                                                        const res = await fetch(`${API}/admin/products/${p.id}`, {
                                                                            method: "PUT",
                                                                            headers: {
                                                                                "Content-Type": "application/json",
                                                                                Authorization: `Bearer ${token}`,
                                                                            },
                                                                            body: JSON.stringify({ is_active: nextActive }),
                                                                        });
                                                                        if (!res.ok) {
                                                                            const data = await res.json().catch(() => ({}));
                                                                            alert(`No se pudo actualizar el estado: ${data?.error || res.statusText}`);
                                                                            setChangingStatusId(null);
                                                                            setChangingStatusMsg("");
                                                                            return;
                                                                        }
                                                                        if (isStatusFilter) {
                                                                            setChangingStatusMsg(`Cambiando producto a ${nextActive ? 'activo' : 'inactivo'}...`);
                                                                            setTimeout(() => {
                                                                                setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: nextActive } : prod));
                                                                                setChangingStatusId(null);
                                                                                setChangingStatusMsg("");
                                                                            }, 2000);
                                                                        } else {
                                                                            setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: nextActive } : prod));
                                                                        }
                                                                    } catch {
                                                                        alert("Error actualizando estado");
                                                                        setChangingStatusId(null);
                                                                        setChangingStatusMsg("");
                                                                    }
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    border: 'none',
                                                                    background: 'none',
                                                                    cursor: changingStatusId === p.id ? 'not-allowed' : 'pointer',
                                                                    padding: 0,
                                                                    margin: 0,
                                                                }}
                                                            >
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    width: 38,
                                                                    height: 22,
                                                                    borderRadius: 12,
                                                                    background: p.is_active ? '#bbf7d0' : '#fecaca',
                                                                    position: 'relative',
                                                                    transition: 'background 0.2s',
                                                                    marginRight: 8,
                                                                }}>
                                                                    <span style={{
                                                                        position: 'absolute',
                                                                        left: p.is_active ? 18 : 2,
                                                                        top: 2,
                                                                        width: 18,
                                                                        height: 18,
                                                                        borderRadius: '50%',
                                                                        background: p.is_active ? '#059669' : '#b91c1c',
                                                                        transition: 'left 0.2s, background 0.2s',
                                                                    }} />
                                                                </span>
                                                                <span style={{
                                                                    fontSize: 12,
                                                                    fontWeight: 600,
                                                                    color: p.is_active ? '#059669' : '#b91c1c',
                                                                    minWidth: 54,
                                                                    textAlign: 'left',
                                                                }}>
                                                                    {p.is_active ? 'Activo' : 'Inactivo'}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {filtered.length === 0 && <div className="text-center py-8 text-gray-500">No se encontraron productos</div>}

            <AdminBudgetModal
                open={budgetModalOpen}
                items={selectedBudgetItems}
                onClose={() => setBudgetModalOpen(false)}
                onRemoveItem={(productId) => {
                    setBudgetSelections((prev) => ({
                        ...prev,
                        [productId]: {
                            checked: false,
                            quantity: 1,
                        },
                    }));
                }}
            />

            {/* Modal edición/creación */}
            {form && (
                <form
                    onSubmit={save}
                    onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const tag = e.target?.tagName?.toUpperCase?.();
                        const isContentEditable = e.target?.isContentEditable;
                        if (tag === "TEXTAREA" || isContentEditable) return;
                        e.preventDefault();
                    }}
                    className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
                >
                    <div className="bg-white p-6 rounded-lg w-full max-w-3xl space-y-3 max-h-[90vh] overflow-y-auto">

                        <h2 className="text-lg font-semibold">{form.id ? "Editar" : "Nuevo"} Producto</h2>

                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                        <input
                            className="w-full border rounded px-3 py-2"
                            placeholder="Nombre"
                            value={form.name || ""}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                        />

                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción larga</label>
                        <RichTextInput
                            value={form.short_description || ""}
                            placeholder="(descripción detallada del producto)"
                            onChange={(next) => setForm({ ...form, short_description: next })}
                            minHeight="120px"
                        />

                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción corta</label>
                        <RichTextInput
                            value={form.description || ""}
                            placeholder="Descripción breve (se muestra debajo del precio)"
                            onChange={(next) => setForm({ ...form, description: next })}
                            minHeight="90px"
                            className="px-7 py-2"
                        />

                        <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                        <input
                            className="w-full border rounded px-3 py-2"
                            placeholder="Marca"
                            value={form.brand || ""}
                            onChange={(e) => setForm({ ...form, brand: e.target.value })}
                        />

                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mililitros (ml)</label>
                                <input
                                    className="w-full border rounded px-3 py-2"
                                    placeholder="Ej: 100, 200, 500"
                                    type="number"
                                    min={0}
                                    step={1}
                                    inputMode="numeric"
                                    {...noSpin}
                                    value={
                                        form.volume_ml === "" ||
                                            form.volume_ml === null ||
                                            form.volume_ml === undefined
                                            ? ""
                                            : form.volume_ml
                                    }
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((prev) => ({
                                            ...prev,
                                            volume_ml: v === "" ? "" : Math.max(0, Math.floor(Number(v))),
                                        }));
                                    }}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Stock (ml)</label>
                                <input
                                    className="w-full border rounded px-3 py-2"
                                    placeholder="Ej: 20"
                                    type="number"
                                    min={0}
                                    step={1}
                                    inputMode="numeric"
                                    {...noSpin}
                                    value={
                                        form.volume_stock === "" ||
                                            form.volume_stock === null ||
                                            form.volume_stock === undefined
                                            ? ""
                                            : form.volume_stock
                                    }
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((prev) => ({
                                            ...prev,
                                            volume_stock: v === "" ? "" : Math.max(0, Math.floor(Number(v))),
                                        }));
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                className="h-10 px-3 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                                onClick={() => {
                                    const ml = Number(form.volume_ml);
                                    const price = parseFlexibleDecimal(form.price);
                                    const priceWholesale = parseFlexibleDecimal(form.price_wholesale);
                                    const stock = Math.max(0, Math.floor(Number(form.volume_stock) || 0));
                                    const row = {
                                        ml: Number.isFinite(ml) && ml > 0 ? Math.floor(ml) : null,
                                        price: Number.isFinite(price) && price > 0 ? price : null,
                                        stock,
                                        price_wholesale:
                                            Number.isFinite(priceWholesale) && priceWholesale > 0
                                                ? priceWholesale
                                                : null,
                                    };

                                    if (row.ml == null) {
                                        setPendingPriceWithoutMlRow(row);
                                        setShowPriceWithoutMlModal(true);
                                        return;
                                    }

                                    setForm((prev) => {
                                        return {
                                            ...clearPricingInputs(prev),
                                            volume_options: upsertVolumeOption(prev.volume_options || [], row),
                                        };
                                    });
                                }}
                            >
                                Agregar
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Precio minorista
                                </label>

                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        $
                                    </span>

                                    <input
                                        className="w-full border rounded pl-7 pr-3 py-2"
                                        placeholder="Precio minorista"
                                        type="text"
                                        inputMode="decimal"
                                        {...noSpin}
                                        value={form.price ?? ""}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                price: e.target.value.replace(/[^\d,.\s]/g, "")
                                            })
                                        }
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Precio mayorista
                                </label>

                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        US$
                                    </span>

                                    <input
                                        className="w-full border rounded pl-12 pr-3 py-2"
                                        placeholder="Opcional"
                                        type="text"
                                        inputMode="decimal"
                                        {...noSpin}
                                        value={form.price_wholesale ?? ""}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                price_wholesale: e.target.value.replace(/[^\d,.\s]/g, "")

                                            })
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        {(form.volume_options || []).length > 0 && (
                            <div className="space-y-2 border rounded p-3">
                                {(form.volume_options || []).map((row, idx) => (
                                    <div key={`${row.ml}-${idx}`} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                                        <span>
                                            {row.ml != null ? `${row.ml} ml` : "Sin ml"} · {Number(row.price) > 0 ? `$${Number(row.price).toLocaleString("es-AR")}` : "Consultar"}
                                            {Number(row.price_wholesale) > 0
                                                ? ` · Mayorista $${formatPrice(row.price_wholesale)}`
                                                : ""}
                                            {` · Stock ${Number.isFinite(Number(row.stock)) ? Number(row.stock) : 0}`}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="px-2 py-1 border rounded hover:bg-gray-50"
                                                title="Editar"

                                                onClick={() =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        volume_ml: row.ml ?? "",
                                                        volume_stock: Number.isFinite(Number(row?.stock)) ? String(row.stock) : "",
                                                        price: Number(row?.price) > 0 ? String(row.price) : "",
                                                        price_wholesale:
                                                            Number(row?.price_wholesale) > 0 ? formatPrice(row.price_wholesale) : "",

                                                        volume_options: (prev.volume_options || []).filter((_, i) => i !== idx),
                                                    }))
                                                }

                                            >
                                                ✏️
                                            </button>
                                            <button
                                                type="button"
                                                className="px-2 py-1 border rounded hover:bg-gray-50 text-red-600"
                                                title="Eliminar"
                                                onClick={() =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        volume_options: (prev.volume_options || []).filter((_, i) => i !== idx),
                                                    }))
                                                }
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/*
<label className="block text-sm font-medium text-gray-700 mb-1">
  Puffs (caladas)
</label>
<input
  className="w-full border rounded px-3 py-2"
  placeholder="Ej: 10000"
  type="number"
  min={0}
  step={1}
  inputMode="numeric"
  pattern="\d*"
  {...noSpin}
  value={
    form.puffs === "" ||
    form.puffs === null ||
    form.puffs === undefined
      ? ""
      : form.puffs
  }
  onChange={(e) => {
    const v = e.target.value;
    setForm((prev) => ({
      ...prev,
      puffs: v === "" ? "" : Math.max(0, Math.floor(Number(v))),
    }));
  }}
/>

{shouldShowFlavors(form.category_id) && (
  <>
    <label className="flex items-center gap-2 mb-2">
      <input
        type="checkbox"
        checked={Boolean(form.flavor_stock_mode)}
        onChange={(e) => {
          const checked = e.target.checked;
          setForm((prev) => {
            const safeCatalog = Array.isArray(prev.flavor_catalog)
              ? prev.flavor_catalog
              : [];
            return {
              ...prev,
              flavor_stock_mode: checked,
              flavor_enabled: checked ? true : prev.flavor_enabled,
              flavor_catalog: safeCatalog,
              stock: checked
                ? sumActiveFlavorStock(safeCatalog)
                : prev.stock,
            };
          });
        }}
      />
      Usar stock por sabor
    </label>

    {form.flavor_stock_mode && (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          Sabores
        </label>

        <FlavorPills
          catalog={
            Array.isArray(form.flavor_catalog)
              ? form.flavor_catalog
              : (form.flavors || []).map((n) => ({
                  name: n,
                  active: true,
                  stock: 0,
                }))
          }
          onChange={(next) =>
            setForm((prev) => {
              const activos = next.filter((x) => x.active);
              const total = sumActiveFlavorStock(next);
              return {
                ...prev,
                flavor_catalog: next,
                flavors: activos.map((x) => x.name),
                stock: prev.flavor_stock_mode ? total : prev.stock,
              };
            })
          }
        />

        <div className="text-xs text-gray-600">
          Total (activos):
          <strong>
            {sumActiveFlavorStock(form.flavor_catalog || [])}
          </strong>
        </div>
      </div>
    )}
  </>
)}
*/}
                        {/* Stock general: solo visible si NO usamos stock por sabor */}
                        {/*  <label className="block text-sm font-medium text-gray-700 mb-1">
                            Stock
                        </label>

                        <input
                            className="w-full border rounded px-3 py-2"
                            placeholder="Stock"
                            type="number"
                            min={0}
                            step={1}
                            {...noSpin}
                            value={Number.isFinite(Number(form.stock)) ? form.stock : 0}
                            onChange={(e) => {
                                const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
                                setForm({ ...form, stock: n })
                            }}
                            required
                        /> */}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Imagen del producto</label>

                        <div className="flex flex-nowrap items-center gap-2">
                            <input
                                className="flex-1 min-w-0 border rounded px-3 py-2"
                                placeholder="URL de la imagen"
                                value={form.image_url || ""}
                                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();

                                        if (!form.image_url) return;

                                        // Agregar a la galería
                                        setForm((prev) => ({
                                            ...prev,
                                            image_urls: prev.image_urls
                                                ? [...prev.image_urls, prev.image_url]
                                                : [prev.image_url],
                                            image_url: "" // limpiar input
                                        }));
                                    }
                                }}
                            />

                            {/* Subir PRINCIPAL */}
                            <input
                                ref={mainImgInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadImage(f, { asMain: true });
                                    e.target.value = "";
                                }}
                            />
                            <button
                                type="button"
                                disabled={uploadingImage}
                                onClick={() => mainImgInputRef.current?.click()}
                                className="px-3 py-2 border rounded hover:bg-gray-50 shrink-0 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Subir como principal"
                            >
                                Subir principal
                            </button>

                            {/* Agregar a GALERÍA */}
                            <input
                                ref={galImgInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadImage(f, { asMain: false });
                                    e.target.value = "";
                                }}
                            />
                            <button
                                type="button"
                                disabled={uploadingImage}
                                onClick={() => galImgInputRef.current?.click()}
                                className="px-3 py-2 border rounded hover:bg-gray-50 shrink-0 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Agregar a galería"
                            >
                                Agregar foto
                            </button>
                            <button
                                type="button"
                                disabled={uploadingImage}
                                onClick={deleteSelectedImage}
                                className="px-3 py-2 border rounded hover:bg-red-50 shrink-0 whitespace-nowrap text-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Eliminar la foto seleccionada (principal)"
                            >
                                Eliminar foto seleccionada
                            </button>

                            {uploadingImage && (
                                <div className="flex items-center gap-2 text-sm text-blue-700 shrink-0 whitespace-nowrap">
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                                    <span>{uploadingImageLabel}</span>
                                </div>
                            )}

                        </div>


                        {/* Preview de imagen (compatible con /public/img/<id>), 1:1 sin recortes */}
                        <div className="mt-2">
                            <img
                                src={toAbsUrl(form.image_url) || sinImagen}
                                alt="Preview"
                                className="block w-full h-auto max-h-44 object-contain border rounded"
                                loading="lazy"
                                decoding="async"
                                onError={(e) => { e.currentTarget.src = sinImagen; }}
                            />
                        </div>

                        {Array.isArray(form.image_urls) && form.image_urls.length > 0 && (
                            <div className="mt-2">
                                <div className="text-xs text-gray-600 mb-1">Galería (clic para principal)</div>
                                <div className="flex flex-wrap gap-2">
                                    {form.image_urls.map((u, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setForm((prev) => ({ ...prev, image_url: u }))}
                                            className={`border rounded p-0.5 ${form.image_url === u ? "ring-2 ring-purple-500" : ""}`}
                                            title="Hacer principal"
                                        >
                                            <img
                                                src={toAbsUrl(u)}
                                                className="w-16 h-16 object-contain"
                                                alt=""
                                                loading="lazy"
                                                onError={(e) => { e.currentTarget.src = sinImagen; }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}




                        <select
                            className="w-full border rounded px-3 py-2"
                            value={form.category_id || ""}
                            onChange={(e) => {
                                const categoryId = parseInt(e.target.value)
                                const show = shouldShowFlavors(categoryId)
                                setForm({
                                    ...form,
                                    category_id: categoryId,
                                    category_name: ID_TO_CATEGORY_NAME[categoryId] || "Masculinos",
                                    flavor_enabled: show,
                                    flavors: show ? form.flavors || [] : [],
                                })
                            }}
                            required
                        >
                            <option value="">Selecciona categoría</option>
                            {PERFUME_CATEGORY_DEFINITIONS.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                        </select>

                        {/* Sabores solo para 1 y 3 */}

                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={form.is_active ?? true}
                                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                            />
                            Producto activo
                        </label>

                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={Boolean(form.is_home_featured)}
                                onChange={(e) => setForm({ ...form, is_home_featured: e.target.checked })}
                                style={{ accentColor: "#2563eb" }}
                            />
                            Inicio
                        </label>

                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={Boolean(form.is_best_seller)}
                                onChange={(e) => setForm({ ...form, is_best_seller: e.target.checked })}
                                style={{ accentColor: "#16a34a" }}
                            />
                            Mas Vendidos
                        </label>

                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setForm(null)} disabled={savingProduct} className="px-3 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={savingProduct}
                                className={`px-3 py-2 text-white rounded hover:opacity-90 flex items-center gap-2 ${savingProduct ? 'bg-orange-600' : 'bg-purple-600 hover:bg-purple-700'}`}
                            >
                                {savingProduct && (
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                )}
                                {savingProduct ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>

                        {showZeroStockModal && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
                                <div className="bg-white rounded-lg p-5 w-full max-w-md space-y-4">
                                    <p className="text-sm text-gray-800 whitespace-pre-line">
                                        {"⚠ Este producto se guardará sin stock disponible.\n¿Querés continuar?"}
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowZeroStockModal(false)}
                                            className="px-3 py-2 border rounded"
                                        >
                                            Volver a editar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setShowZeroStockModal(false);
                                                await doSaveProduct();
                                            }}
                                            className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                            Confirmar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showMissingPricingModal && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
                                <div className="bg-white rounded-lg p-5 w-full max-w-md space-y-4">
                                    <p className="text-sm text-gray-800">
                                        Hay una combinación de precios y mililitros sin agregar.
                                        <br />
                                        Debes presionar "agregar" antes de guardar.
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowMissingPricingModal(false)}
                                            className="px-3 py-2 border rounded"
                                        >
                                            Volver a editar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setShowMissingPricingModal(false);
                                                await continueSaveFlow();
                                            }}
                                            className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                            Continuar de todos modos
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showPriceWithoutMlModal && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
                                <div className="bg-white rounded-lg p-5 w-full max-w-md space-y-4">
                                    <p className="text-sm text-gray-800">
                                        Estás cargando un precio minorista sin mililitros.
                                        <br />
                                        El producto se puede guardar igual y el precio quedará como precio general.
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowPriceWithoutMlModal(false);
                                                setPendingPriceWithoutMlRow(null);
                                            }}
                                            className="px-3 py-2 border rounded"
                                        >
                                            Volver a editar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowPriceWithoutMlModal(false);
                                                if (pendingPriceWithoutMlRow) {
                                                    setForm((prev) => ({
                                                        ...clearPricingInputs(prev),
                                                        volume_options: upsertVolumeOption(
                                                            prev.volume_options || [],
                                                            pendingPriceWithoutMlRow
                                                        ),
                                                    }));
                                                }
                                                setPendingPriceWithoutMlRow(null);
                                            }}
                                            className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                            Entendido
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </form>
            )}

            {saveSuccessModal.open && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
                    <div className="bg-white rounded-lg p-5 w-full max-w-md space-y-4">
                        <p className="text-sm text-gray-800">
                            Producto {saveSuccessModal.action} correctamente.
                            <br />
                            Agregado a la categoría <strong>{saveSuccessModal.category}</strong>.
                        </p>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() =>
                                    setSaveSuccessModal({
                                        open: false,
                                        action: "",
                                        category: "",
                                    })
                                }
                                className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de importación masiva */}
            {importOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Importar productos ({importPreview.length})</h2>
                            <button onClick={() => setImportOpen(false)} className="px-3 py-1 border rounded">
                                Cerrar
                            </button>
                        </div>

                        <div className="border rounded">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="p-2 text-left">Nombre</th>
                                        <th className="p-2 text-left">Categoría</th>
                                        <th className="p-2 text-left">Precio</th>
                                        <th className="p-2 text-left">Stock</th>
                                        <th className="p-2 text-left">Sabores (catálogo)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importPreview.map((p, idx) => (
                                        <tr key={idx} className="border-t">
                                            <td className="p-2">{p.name}</td>
                                            <td className="p-2">{getDisplayCategoryName(p)}</td>
                                            <td className="p-2">${p.price}</td>
                                            <td className="p-2">{p.stock}</td>
                                            <td className="p-2">{p.flavor_catalog?.length || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setImportOpen(false)} className="px-3 py-2 border rounded">
                                Cancelar
                            </button>
                            <button
                                disabled={importing}
                                onClick={async () => {
                                    try {
                                        setImporting(true)
                                        for (const p of importPreview) {
                                            const active = (p.flavor_catalog || []).filter((x) => x.active).map((x) => x.name)
                                            const body = {
                                                ...p,
                                                flavors: active, // solo los activos se publican
                                                flavor_enabled: p.flavor_catalog.length > 0,
                                                flavor_catalog: p.flavor_catalog, // guardamos el catálogo completo para edición
                                                flavor_stock_mode: false,
                                            }

                                            // tu API usa category_id; no necesita category_name
                                            delete body.category_name
                                            const res = await fetch(`${API}/admin/products`, {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type": "application/json",
                                                    Authorization: `Bearer ${token}`,
                                                },
                                                body: JSON.stringify(body),
                                            })
                                            if (!res.ok) {
                                                const err = await res.json().catch(() => ({}))
                                                console.warn("Fallo al crear", p.name, err)
                                            }
                                        }
                                        setImportOpen(false)
                                        setImportPreview([])
                                        fetchAll()
                                        alert("Importación completada")
                                    } catch (e) {
                                        console.error(e)
                                        alert("Error en importación")
                                    } finally {
                                        setImporting(false)
                                    }
                                }}
                                className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {importing ? "Importando..." : `Crear ${importPreview.length} productos`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

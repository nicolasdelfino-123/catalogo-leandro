// src/components/product/ProductGridNuevo.jsx
import { useState, useEffect, useContext, useMemo, useRef, useLayoutEffect } from "react";
import { useParams, useNavigate, Link, useLocation, useSearchParams } from "react-router-dom";


// Ajustá estos imports si tu estructura difiere:
import { Context } from "../../../js/store/appContext.jsx"// (si en tu proyecto es .jsx, cambialo)
import ProductCardPerfumes from "../cards//ProductCardPerfumes.jsx";        // o "../ui/cards/ProductCardPerfumes.jsx" / donde esté tu card
import SidebarFiltersNuevo from "./SidebarFiltersNuevo.jsx";     // o "./SidebarFilterNuevo.jsx" cuando lo refactoricemos
import Modal from "../../Modal.jsx";
import { ChevronRight, ChevronLeft, ArrowUpDown } from "lucide-react";
import { withWholesale } from "../../../utils/wholesaleMode.js";
import { getNormalizedCategoryId, SLUG_TO_ID, SLUG_TO_NAME } from "../../../utils/perfumeCategories.js";

// -----------------------------
// Persistencia ligera en sessionStorage
// -----------------------------
const GRID_STATE_KEY = "productGridState";

const readGridState = (key) => {
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeGridState = (key, state) => {
    try {
        sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
        // noop
    }
};

const getDefaultItemsPerPage = () => {
    if (typeof window === "undefined") return 24;
    return window.innerWidth >= 768 ? 24 : 16;
};

const renderColumnsIcon = (cols, active) => {
    const squareClass = active ? "bg-black" : "bg-stone-400/80";

    return (
        <span
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            aria-hidden="true"
        >
            {Array.from({ length: cols * 2 }).map((_, idx) => (
                <span key={idx} className={`h-[6px] w-[6px] rounded-[1px] ${squareClass}`} />
            ))}
        </span>
    );
};

// -----------------------------
// Normalizadores
// -----------------------------
const normalizeBrand = (b = "") =>
    String(b).trim().replace(/\s+/g, " ").toLowerCase();

const parseMl = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
    const text = String(value).trim();
    if (!text) return null;
    const match = text.match(/\d+/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? Math.floor(n) : null;
};

const getProductMlValues = (product) => {
    const out = [];
    const pushMl = (raw) => {
        const ml = parseMl(raw);
        if (ml && ml > 0) out.push(ml);
    };

    pushMl(product?.volume_ml);

    const rawVolumeOptions = (() => {
        if (Array.isArray(product?.volume_options)) return product.volume_options;
        if (Array.isArray(product?.volumeOptions)) return product.volumeOptions;
        if (typeof product?.volume_options === "string") {
            try {
                const parsed = JSON.parse(product.volume_options);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        if (typeof product?.volumeOptions === "string") {
            try {
                const parsed = JSON.parse(product.volumeOptions);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    })();

    for (const opt of rawVolumeOptions) {
        pushMl(opt?.ml ?? opt?.volume_ml ?? opt?.size_ml ?? opt?.volumeMl ?? opt?.sizeMl);
    }

    return Array.from(new Set(out)).sort((a, b) => a - b);
};

// -----------------------------
// Componente
// -----------------------------
export default function ProductGridNuevo({ category, hideFilters = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { slug } = useParams();
    const [searchParams] = useSearchParams();


    const { store, actions } = useContext(Context);

    // Filtros
    const [priceRange, setPriceRange] = useState({ min: 0, max: Infinity });
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [selectedMls, setSelectedMls] = useState([]);

    // UI
    const [modalOpen, setModalOpen] = useState(false);

    // Paginación + Orden
    const [itemsPerPage, setItemsPerPage] = useState(getDefaultItemsPerPage);
    const [currentPage, setCurrentPage] = useState(
        Number(searchParams.get("page")) || 1
    );
    const [sortOrder, setSortOrder] = useState("default"); // default | price-asc | price-desc
    const [cardsPerRow, setCardsPerRow] = useState(4);
    const [mobileSortOpen, setMobileSortOpen] = useState(false);

    // Persistencia por categoría
    const storageKey = useMemo(() => `${GRID_STATE_KEY}:${slug || "all"}`, [slug]);

    const restoredRef = useRef(false);
    const isInitialMount = useRef(true);
    const gridRestoredRef = useRef(false);
    const skipNextPageResetRef = useRef(false);


    const currentSlug = slug;
    const currentCategoryId = currentSlug ? SLUG_TO_ID[currentSlug] : null;

    const searchTerm = store.productSearch || "";
    const setSearchTerm = (val) => actions.searchProducts(val);

    // -----------------------------
    // Efectos iniciales
    // -----------------------------
    useEffect(() => {
        // Si venimos de un detalle y hay ancla guardada, NO scrollees arriba.
        // Dejá que el useLayoutEffect haga el scrollIntoView.
        const lastId = sessionStorage.getItem("lastProductId");
        if (lastId) return;

        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (actions?.fetchProducts) actions.fetchProducts();
    }, []);

    // Si venís desde footer, scroll arriba (mantengo tu lógica)
    useEffect(() => {
        if (location.state?.fromFooter) {
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }, 50);

            // Limpia state del historial para evitar repeticiones
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    // -----------------------------
    // Restaurar filtros guardados (solo 1 vez)
    // -----------------------------
    useEffect(() => {
        if (!isInitialMount.current) return;

        const saved = readGridState(storageKey);
        if (saved) {
            setSearchTerm(saved.searchTerm ?? "");

            const pr = saved.priceRange ?? { min: 0, max: Infinity };
            setPriceRange({
                min: Number.isFinite(pr.min) ? pr.min : 0,
                max: Number.isFinite(pr.max) ? pr.max : Infinity,
            });

            setSelectedBrands(saved.selectedBrands ?? []);
            setSelectedMls(saved.selectedMls ?? []);

            const defaultItemsPerPage = getDefaultItemsPerPage();
            const restoredItemsPerPage =
                window.innerWidth < 768
                    ? defaultItemsPerPage
                    : saved.itemsPerPage == null
                    ? defaultItemsPerPage
                    : (window.innerWidth >= 768 && saved.itemsPerPage === 12
                        ? 24
                        : saved.itemsPerPage);

            setItemsPerPage(restoredItemsPerPage);
            setCardsPerRow(saved.cardsPerRow ?? 4);

            const forcedPage = Number(sessionStorage.getItem("lastProductPage"));
            if (Number.isFinite(forcedPage) && forcedPage > 0) {
                setCurrentPage(forcedPage);
            } else {
                setCurrentPage(saved.currentPage ?? 1);
            }

            setSortOrder(saved.sortOrder ?? "default");


            restoredRef.current = true;
            skipNextPageResetRef.current = true;

        }

        isInitialMount.current = false;
    }, [storageKey]);

    // -----------------------------
    // Reset de filtros al cambiar categoría (si no hay estado guardado)
    // -----------------------------
    useEffect(() => {
        if (isInitialMount.current || restoredRef.current) {
            if (restoredRef.current) restoredRef.current = false;
            return;
        }

        // Si estamos volviendo desde un detalle con ancla, no reseteamos nada
        const lastId = sessionStorage.getItem("lastProductId");
        if (lastId) return;

        setItemsPerPage(getDefaultItemsPerPage());

        const saved = readGridState(storageKey);
        if (!saved) {
            setSearchTerm("");
            setPriceRange({ min: 0, max: Infinity });
            setSelectedBrands([]);
            setSelectedMls([]);
            setSortOrder("default");
            setCurrentPage(1);
        }
    }, [slug, category, storageKey]);

    // -----------------------------
    // Productos por categoría / destacados
    // -----------------------------
    const categoryProducts = useMemo(() => {
        const products = store.products || [];
        const isBestSellersCategory = currentSlug === "mas-vendidos" || Number(currentCategoryId) === 8;

        // Home / destacados
        if (hideFilters && !currentCategoryId) return products.slice(0, 12);

        if (isBestSellersCategory) {
            return products
                .filter((p) => p?.is_best_seller || getNormalizedCategoryId(p) === 8)
                .sort((a, b) => Number(a?.best_seller_rank ?? 999999) - Number(b?.best_seller_rank ?? 999999));
        }

        // Todos
        if (!currentCategoryId) return products;

        // Categoría actual
        return products.filter(
            (p) => getNormalizedCategoryId(p) === Number(currentCategoryId)
        );
    }, [store.products, currentCategoryId, slug, category, hideFilters]);

    // -----------------------------
    // Opciones de filtros
    // -----------------------------
    const brandOptions = useMemo(() => {
        const counter = new Map();

        for (const p of categoryProducts) {
            if (!p?.brand) continue;
            const key = normalizeBrand(p.brand);
            if (!key) continue;
            counter.set(key, (counter.get(key) || 0) + 1);
        }

        return Array.from(counter.entries())
            .map(([key, count]) => ({ key, count, label: key.toUpperCase() }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [categoryProducts]);

    const categoryPriceRange = useMemo(() => {
        if (categoryProducts.length === 0) return { min: 0, max: 50000 };

        const prices = categoryProducts
            .map((p) => Number(p.price) || 0)
            .filter((p) => p > 0);

        if (prices.length === 0) return { min: 0, max: 50000 };

        return { min: 0, max: Math.max(...prices) };
    }, [categoryProducts]);

    const mlOptions = useMemo(() => {
        const counter = new Map();
        for (const p of categoryProducts) {
            const values = getProductMlValues(p);
            for (const ml of values) {
                counter.set(ml, (counter.get(ml) || 0) + 1);
            }
        }
        return Array.from(counter.entries())
            .map(([value, count]) => ({ value, count, label: `${value}ml` }))
            .sort((a, b) => a.value - b.value);
    }, [categoryProducts]);

    const effectivePriceRange = useMemo(() => {
        return {
            min: Number.isFinite(priceRange?.min) ? priceRange.min : categoryPriceRange.min,
            max: Number.isFinite(priceRange?.max) ? priceRange.max : categoryPriceRange.max,
        };
    }, [priceRange, categoryPriceRange.min, categoryPriceRange.max]);

    const isPriceFilterApplied = useMemo(() => {
        return (
            effectivePriceRange.min !== categoryPriceRange.min ||
            effectivePriceRange.max !== categoryPriceRange.max
        );
    }, [effectivePriceRange, categoryPriceRange.min, categoryPriceRange.max]);


    // -----------------------------
    // Filtrado
    // -----------------------------
    const filteredProducts = useMemo(() => {
        const q = String(searchTerm).toLowerCase();
        const hasBrandFilter = selectedBrands.length > 0;

        return categoryProducts.filter((product) => {
            const name = product.name?.toLowerCase() || "";
            const brandNorm = normalizeBrand(product.brand || "");

            const matchesSearch = !q || name.includes(q) || brandNorm.includes(q);

            const price = Number(product.price) || 0;
            const matchesPrice =
                price >= effectivePriceRange.min &&
                (effectivePriceRange.max === Infinity || price <= effectivePriceRange.max);

            const matchesBrand =
                !hasBrandFilter || (brandNorm && selectedBrands.includes(brandNorm));
            const productMls = getProductMlValues(product);
            const matchesMl =
                selectedMls.length === 0
                    ? true
                    : productMls.some((ml) => selectedMls.includes(ml));

            return (
                matchesSearch &&
                matchesPrice &&
                matchesBrand &&
                matchesMl
            );
        });
    }, [
        categoryProducts,
        searchTerm,
        priceRange,
        selectedBrands,
        selectedMls,
    ]);

    // -----------------------------
    // Ordenamiento
    // -----------------------------
    const sortedProducts = useMemo(() => {
        const sorted = [...filteredProducts];

        if (sortOrder === "price-asc") {
            sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        } else if (sortOrder === "price-desc") {
            sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        }

        return sorted;
    }, [filteredProducts, sortOrder]);

    // -----------------------------
    // Paginación
    // -----------------------------
    const totalPages = itemsPerPage ? Math.ceil(sortedProducts.length / itemsPerPage) : 1;

    const paginatedProducts = useMemo(() => {
        if (!itemsPerPage) return sortedProducts;
        const start = (currentPage - 1) * itemsPerPage;
        return sortedProducts.slice(start, start + itemsPerPage);
    }, [sortedProducts, currentPage, itemsPerPage]);

    // Reset a página 1 cuando cambian filtros/orden/items
    // Reset a página 1 cuando cambian filtros/orden/items
    useEffect(() => {
        if (skipNextPageResetRef.current) {
            skipNextPageResetRef.current = false;
            return;
        }

        // Si venimos de detalle, primero restauramos producto/página antes de resetear.
        const lastId = sessionStorage.getItem("lastProductId");
        if (lastId) return;

        setCurrentPage(1);
    }, [
        searchTerm,
        priceRange,
        selectedBrands,
        selectedMls,
        sortOrder,
        itemsPerPage,
        cardsPerRow,
    ]);


    const handlePageChange = (pageNum) => {
        setCurrentPage(pageNum);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // -----------------------------
    // Restaurar scroll (mantengo tu lógica actual con delay)
    // -----------------------------


    // -----------------------------
    // Guardar estado (con debounce)
    // -----------------------------
    useEffect(() => {
        if (isInitialMount.current) return;

        const timeoutId = setTimeout(() => {
            const pr = {
                min: Number.isFinite(priceRange?.min) ? priceRange.min : 0,
                max: Number.isFinite(priceRange?.max) ? priceRange.max : null,
            };

            writeGridState(storageKey, {
                searchTerm,
                priceRange: pr,
                selectedBrands,
                selectedMls,
                itemsPerPage,
                cardsPerRow,
                currentPage,
                sortOrder,

            });
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [
        storageKey,
        searchTerm,
        priceRange,
        selectedBrands,
        selectedMls,
        itemsPerPage,
        cardsPerRow,
        currentPage,
        sortOrder,
    ]);



    // -----------------------------
    // Quick add (mantengo lógica)
    // -----------------------------
    const handleQuickAdd = (product) => {
        const hasFlavors =
            Array.isArray(product?.flavors) && product.flavors.length > 0;

        if (hasFlavors) {
            setModalOpen(true);
            return;
        }

        if (actions?.addToCart) {
            actions.addToCart({ productId: product.id, qty: 1, flavor: null });
        } else {
            console.warn("addToCart no está definido en actions");
        }
    };

    const pageTitle = currentCategoryId
        ? SLUG_TO_NAME?.[currentSlug] || "Todos los Productos"
        : category || "Todos los Productos";

    // -----------------------------
    // Sidebar: navegar a categoría (mantengo tu lógica exacta)
    // -----------------------------
    const handleSelectCategory = (newSlug) => {
        if (!newSlug) return;

        // cambio explícito de categoría: no mezclar con restauración desde detalle
        sessionStorage.removeItem("lastProductId");

        // estado limpio al cambiar categoría
        setSearchTerm("");
        setSelectedBrands([]);
        setSelectedMls([]);
        setSortOrder("default");
        setPriceRange({ min: 0, max: Infinity });
        setItemsPerPage(getDefaultItemsPerPage());
        setCurrentPage(1);

        skipNextPageResetRef.current = true;
        gridRestoredRef.current = false;

        const isWholesale = location.pathname.startsWith("/mayorista");
        const base = isWholesale ? "/mayorista" : "";

        window.scrollTo({ top: 0, behavior: "auto" });
        navigate(`${base}/categoria/${newSlug}`);
    };


    useLayoutEffect(() => {
        const lastIdRaw = sessionStorage.getItem("lastProductId");
        if (!lastIdRaw) return;

        const lastId = Number(lastIdRaw);
        if (!Number.isFinite(lastId)) {
            sessionStorage.removeItem("lastProductId");
            return;
        }

        if (paginatedProducts.length === 0) return;

        const forcedPage = Number(sessionStorage.getItem("lastProductPage"));
        if (Number.isFinite(forcedPage) && forcedPage > 0 && forcedPage !== currentPage) {
            setCurrentPage(forcedPage);
            return;
        }

        const scrollToProduct = () => {
            const el = document.querySelector(`[data-product-id="${lastId}"]`);
            if (!el) return;

            const y = el.getBoundingClientRect().top + window.pageYOffset - 120;

            window.scrollTo({
                top: y,
                behavior: "auto"
            });

            sessionStorage.removeItem("lastProductId");
            sessionStorage.removeItem("lastProductPage");
        };

        // esperamos el layout final (incluye imágenes)
        requestAnimationFrame(() => {
            requestAnimationFrame(scrollToProduct);
        });

    }, [paginatedProducts, currentPage]);

    useEffect(() => {
        gridRestoredRef.current = false;
    }, [slug, currentPage, itemsPerPage]);
    // -----------------------------
    // Render
    // -----------------------------
    return (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            {/* Breadcrumb */}
            {!hideFilters && (
                <nav
                    className="flex items-center text-sm font-serif text-stone-500 mb-4 tracking-wide"
                    aria-label="Breadcrumb"
                >
                    <Link to="/" className="hover:text-[#d4af37] transition-colors">
                        Inicio
                    </Link>

                    {currentCategoryId && (
                        <>
                            <ChevronRight size={16} className="mx-2" />
                            <span className="font-serif text-[#232325] font-semibold">{pageTitle}</span>
                        </>
                    )}
                </nav>
            )}

            {/* Header (lo dejé vacío como lo tenías) */}
            <div className="mb-4 sm:mb-6"></div>

            <div className={hideFilters ? "w-full" : "md:flex md:items-start md:gap-6"}>
                {/* Sidebar */}
                {!hideFilters && (
                    <SidebarFiltersNuevo
                        className="md:shrink-0 md:sticky md:top-24 md:self-start"
                        currentCategorySlug={currentSlug}
                        onSelectCategory={handleSelectCategory}
                        priceMin={categoryPriceRange.min}
                        priceMax={categoryPriceRange.max}
                        brandOptions={brandOptions}
                        selectedBrands={selectedBrands}
                        onToggleBrand={(key) =>
                            setSelectedBrands((prev) =>
                                prev.includes(key) ? prev.filter((b) => b !== key) : [...prev, key]
                            )
                        }
                        onClearBrands={() => setSelectedBrands([])}
                        mlOptions={mlOptions}
                        selectedMls={selectedMls}
                        onToggleMl={(v) =>
                            setSelectedMls((prev) =>
                                prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                            )
                        }
                        onClearMls={() => setSelectedMls([])}
                        price={isPriceFilterApplied ? effectivePriceRange : null}
                        onChangePrice={(newRange) => {
                            if (!newRange) {
                                setPriceRange({ min: categoryPriceRange.min, max: Infinity });
                                return;
                            }

                            setPriceRange({
                                min: Number(newRange.min) || categoryPriceRange.min,
                                max: Number.isFinite(Number(newRange.max))
                                    ? Number(newRange.max)
                                    : Infinity,
                            });
                        }}

                    />
                )}

                {/* Contenido */}
                <div className={hideFilters ? "w-full" : "flex-1"}>
                    {/* Barra de búsqueda y controles */}
                    {!hideFilters && (
                        <div className="mb-4 space-y-3">
                            <input
                                type="text"
                                placeholder="Buscar productos en esta categoría..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg font-serif text-sm sm:text-base border border-stone-300 focus:ring-2 focus:ring-[#232325] focus:border-transparent transition-all"
                                style={{ border: "1px solid #9ca5b5ff" }}
                            />

                            <div className="flex w-full items-center justify-between gap-3">
                                {/* Items por página + vista */}
                                <div className="flex items-center gap-3 md:gap-5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-serif text-stone-800 tracking-wide border-b border-stone-300 pb-0.5">
                                            <span className="sm:hidden">Mostrar:</span>
                                            <span className="hidden sm:inline">Productos por página:</span>
                                        </span>
                                        <div className="flex gap-1">
                                            {[8, 12, 16, 24].map((num) => (
                                                <button
                                                    key={num}
                                                    onClick={() => setItemsPerPage(num)}
                                                    className={`px-2 py-1 text-sm font-serif rounded transition-colors ${itemsPerPage === num
                                                        ? "bg-[#232325] text-white"
                                                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                                                        }`}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-2">
                                        <span className=" ms-5 text-sm font-serif text-stone-800 tracking-wide border-b border-stone-300 pb-0.5">
                                            Columnas:
                                        </span>
                                        <div className="flex gap-1">
                                            {[2, 3, 4].map((num) => (
                                                <button
                                                    key={num}
                                                    onClick={() => setCardsPerRow(num)}
                                                    className={`inline-flex items-center justify-center rounded border px-2 py-1.5 transition-colors ${cardsPerRow === num
                                                        ? "border-stone-500 bg-stone-100"
                                                        : "border-stone-200 bg-white hover:border-stone-400"
                                                        }`}
                                                    aria-label={`Ver ${num} productos por fila`}
                                                    title={`${num} por fila`}
                                                >
                                                    {renderColumnsIcon(num, cardsPerRow === num)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Ordenamiento desktop */}
                                <div className="hidden sm:flex items-center gap-2">
                                    <span className="text-sm font-serif text-stone-800 tracking-wide border-b border-stone-300 pb-0.5">
                                        Ordenar:
                                    </span>
                                    <select
                                        value={sortOrder}
                                        onChange={(e) => setSortOrder(e.target.value)}
                                        className="px-3 py-2 text-sm font-serif border border-stone-300 rounded-lg bg-white text-stone-700 hover:border-black hover:text-black focus:ring-2 focus:ring-[#232325] focus:border-transparent transition-colors"
                                    >
                                        <option value="default">Predeterminado</option>
                                        <option value="price-asc">Precio: Bajo a Alto</option>
                                        <option value="price-desc">Precio: Alto a Bajo</option>
                                    </select>
                                </div>

                                {/* Ordenamiento mobile */}
                                <div className="relative flex w-full items-center justify-end sm:hidden">
                                    <button
                                        type="button"
                                        onClick={() => setMobileSortOpen((prev) => !prev)}
                                        className="inline-flex items-center justify-center rounded border border-stone-300 bg-white p-2 text-stone-700 transition-colors hover:border-stone-500 hover:text-black"
                                        aria-label="Ordenar productos"
                                        title="Ordenar"
                                    >
                                        <ArrowUpDown size={18} />
                                    </button>

                                    {mobileSortOpen && (
                                        <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
                                            {[
                                                { value: "default", label: "Predeterminado" },
                                                { value: "price-asc", label: "Precio: Bajo a Alto" },
                                                { value: "price-desc", label: "Precio: Alto a Bajo" },
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setSortOrder(option.value);
                                                        setMobileSortOpen(false);
                                                    }}
                                                    className={`block w-full px-4 py-3 text-left text-sm font-serif transition-colors ${sortOrder === option.value
                                                        ? "bg-stone-100 text-[#232325]"
                                                        : "text-stone-700 hover:bg-stone-50"
                                                        }`}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Loading / Grid */}
                    {store.loading ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                            <p className="mt-2 text-gray-600">Cargando productos...</p>
                        </div>
                    ) : (
                        <>
                            <div className={`grid grid-cols-2 gap-3 sm:gap-6 ${cardsPerRow === 4 ? "lg:grid-cols-4" : cardsPerRow === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
                                {paginatedProducts.map((product) => (
                                    <div
                                        key={product.id}
                                        data-product-id={product.id}
                                        className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl rounded-xl"
                                    >
                                        <ProductCardPerfumes
                                            product={product}
                                            onQuickAdd={() => handleQuickAdd(product)}

                                            returnTo={`${location.pathname}?page=${currentPage}`}
                                            isGrid={true}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Paginación */}
                            {totalPages > 1 && (
                                <div className="mt-8 flex items-center justify-center gap-2">
                                    <button
                                        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                                        aria-label="Página anterior"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>

                                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                                        let pageNum;

                                        if (totalPages <= 7) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 4) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 3) {
                                            pageNum = totalPages - 6 + i;
                                        } else {
                                            pageNum = currentPage - 3 + i;
                                        }

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handlePageChange(pageNum)}
                                                className={`min-w-[40px] h-10 rounded-lg font-serif text-sm transition-all ${currentPage === pageNum
                                                    ? "bg-[#232325] text-white shadow-md scale-105"
                                                    : "bg-white border border-stone-300 text-stone-700 hover:border-black hover:text-black"
                                                    }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}

                                    <button
                                        onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                                        aria-label="Página siguiente"
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    <Modal
                        open={modalOpen}
                        onClose={() => setModalOpen(false)}
                        title="Seleccioná un sabor"
                        body="Antes de agregar este producto al carrito, elegí al menos un sabor."
                        confirmText="Entendido"
                    />

                    {sortedProducts.length === 0 && !store.loading && (
                        <div className="text-center py-12">
                            <p className="text-gray-600">
                                No se encontraron productos que coincidan con tu búsqueda.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

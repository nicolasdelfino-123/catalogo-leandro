import { useState, useContext, useEffect, useRef } from "react";
import { Context } from "../js/store/appContext.jsx";
import Cart from "../components/Cart.jsx";
import AccountDropdown from "../components/AccountDropdown.jsx";
import { Link, useNavigate, useLocation } from "react-router-dom";
/* import logo from '@/assets/logo.png'
import logo22 from '@/assets/logo-22.png' */
import zarpados from '@/assets/zarpados-22.png'
import { withWholesale } from "../utils/navigation.js";
import { formatPrice } from "../utils/price.js";
import { Search, ShoppingCart } from "lucide-react";
import shatha from '@/assets/logo_sisi_lean_si.png'
import { PERFUME_CATEGORY_DEFINITIONS } from "../utils/perfumeCategories.js";

const API = import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "";

const normalizeImagePath = (u = "") => {
  if (!u) return "";
  if (u.startsWith("/admin/uploads/")) u = u.replace("/admin", "/public");
  if (u.startsWith("/uploads/")) u = `/public${u}`;
  return u;
};

const toAbsUrl = (u = "") => {
  u = normalizeImagePath(u);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/public/")) return `${API}${u}`;
  if (u.startsWith("/")) return u;
  return `${API}/${u}`;
};

const parseMoney = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const getWholesaleSearchPrice = (product) => {
  const direct =
    parseMoney(product?.price_wholesale) ??
    parseMoney(product?.priceWholesale) ??
    parseMoney(product?.wholesale_price) ??
    parseMoney(product?.wholesalePrice);
  if (direct && direct > 0) return direct;

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
    if (product?.volume_options && typeof product.volume_options === "object") {
      return Object.values(product.volume_options);
    }
    if (product?.volumeOptions && typeof product.volumeOptions === "object") {
      return Object.values(product.volumeOptions);
    }
    return [];
  })();

  for (const opt of rawVolumeOptions) {
    const optionWholesale =
      parseMoney(opt?.price_wholesale) ??
      parseMoney(opt?.wholesale_price) ??
      parseMoney(opt?.wholesalePrice);
    if (optionWholesale && optionWholesale > 0) return optionWholesale;
  }
  return null;
};

const getRetailSearchPrice = (product) => {
  const direct = parseMoney(product?.price) ?? parseMoney(product?.retail_price) ?? parseMoney(product?.retailPrice);
  if (direct && direct > 0) return direct;

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
    if (product?.volume_options && typeof product.volume_options === "object") {
      return Object.values(product.volume_options);
    }
    if (product?.volumeOptions && typeof product.volumeOptions === "object") {
      return Object.values(product.volumeOptions);
    }
    return [];
  })();

  for (const opt of rawVolumeOptions) {
    const optionRetail = parseMoney(opt?.price) ?? parseMoney(opt?.retail_price) ?? parseMoney(opt?.retailPrice);
    if (optionRetail && optionRetail > 0) return optionRetail;
  }
  return null;
};



export default function Header() {
  const { store, actions } = useContext(Context);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const searchBoxRef = useRef(null);

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const productsCloseTimer = useRef(null);



  // Referencias para el dropdown
  const productsDropdownRef = useRef(null);
  const mobileMenuRef = useRef(null);

  // shrink + mostrar/ocultar
  const [isScrolled, setIsScrolled] = useState(false);
  const [show, setShow] = useState(true);
  const lastY = useRef(0);
  const downScrolls = useRef(0);
  const isScrolling = useRef(false);
  const scrollTimeout = useRef(null);

  // ⚙️ Ajustes rápidos de tamaño (en px)
  const LOGO_BASE_H = 220;    // Altura normal del logo
  const LOGO_SCROLL_H = 195;  // Altura cuando se hace scroll (más pequeño)
  const LOGO_W = "auto";
  const USE_WHITE_KILLER = false;

  // Cerrar dropdown cuando se hace click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (productsDropdownRef.current && !productsDropdownRef.current.contains(event.target)) {
        setProductsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);


  // Cerrar y limpiar búsqueda cuando cambia la ruta
  useEffect(() => {
    setMobileSearchOpen(false);
    setMobileSearchTerm("");
    setSearchResults([]);
  }, [location.pathname]);

  // Cerrar si clickean fuera del cuadro de búsqueda / resultados
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (mobileSearchOpen && searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setMobileSearchOpen(false);
        setMobileSearchTerm("");
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileSearchOpen]);

  const handleSearchChange = async (value) => {
    setMobileSearchTerm(value);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    if (!store.products || store.products.length === 0) {
      await actions.fetchProducts();
    }

    setSearchResults(actions.searchProductsQuick(value));
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isMenuOpen && mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);


  const cartItemsCount = (store.cart || []).reduce((t, i) => t + (i.quantity || 0), 0);

  // Categorías para el dropdown (coinciden con las del backend)
  const categoryIcons = {
    1: "🖤",
    2: "🌸",
    3: "✨",
    // 4: "🧴",
    // 5: "🌸",
    // 7: "🏷️",
  };


  const productCategories = PERFUME_CATEGORY_DEFINITIONS.map((category) => ({
    name: category.name,
    route: `/categoria/${category.slug}`,
    icon: categoryIcons[category.id] || "•",
  }));

  const goToContact = (e) => {
    e.preventDefault();

    const doScroll = () => {
      const el = document.getElementById("asesoria");
      if (!el) return;
      // Altura del header sticky (medimos por si cambia)
      const headerH = document.querySelector("header")?.offsetHeight || 80;
      const y = el.getBoundingClientRect().top + window.pageYOffset - headerH - 8; // un pelín más arriba
      window.scrollTo({ top: y, behavior: "smooth" });
    };



    const currentPath = window.location.pathname;
    const targetInicio = withWholesale("/inicio");

    if (currentPath !== "/inicio" && currentPath !== "/mayorista/inicio") {
      navigate(targetInicio, { state: { scrollTo: "contacto" } });
    } else {
      doScroll();
    }


    setIsMenuOpen(false); // cerrar menú móvil si estaba abierto
  };

  // Evita recargar el header entero en navegación
  useEffect(() => {
    // Esto asegura que React Router no fuerce un re-render del header al cambiar de ruta
    const header = document.querySelector("header img");
    if (header) {
      header.setAttribute("fetchpriority", "high");
      header.decoding = "sync";
    }
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isMenuOpen]);


  return (
    <>
      <header
        className={[
          "fixed top-0 left-0 right-0 md:sticky md:top-0 z-50 bg-[#0B0608]/95 border-b border-yellow-600/20 overflow-visible",
          "transition-shadow duration-300",
          isScrolled ? "shadow-lg" : "shadow-none"
        ].join(" ")}
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          transform: "translateZ(0)",
        }}

      >

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 py-3">


            {/* Mobile hamburger menu - left */}
            {/* Mobile hamburger menu - left */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label="Abrir menú"
                className="bg-transparent border-0 p-0 text-white hover:text-gray-200 flex items-center justify-center"
                style={{ backgroundColor: 'transparent' }}
              >
                <svg className="w-5 h-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
            {/* Logo centrado */}
            <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
              <Link to={withWholesale("/inicio")} aria-label="Ir al inicio" className="pointer-events-auto">
                <img
                  src={shatha}
                  alt="Shatha"
                  className="mt-[-0px] md:mt-[-0px] h-[55px] md:h-[55px] object-contain transition-all duration-300"
                />
              </Link>
            </div>
            {/* Logo */}
            {/*   <div className="flex-shrink-0 md:mr-auto">
            <Link to={withWholesale("/inicio")}
              aria-label="Ir al inicio" className="block">
              <img
                src={zarpados}
                alt="Zarpados"
                className="block w-auto select-none transition-transform duration-300"
                style={{
                  height: isScrolled ? `${LOGO_SCROLL_H}px` : `${LOGO_BASE_H}px`,
                  width: LOGO_W,
                  objectFit: "contain",
                  maxWidth: "300px",
                  transform: isScrolled ? "scale(0.94)" : "scale(1)",
                  willChange: "transform",
                  backfaceVisibility: "hidden",
                  translate: "0",
                  background: "transparent",
                }}
                decoding="sync"
                loading="eager"
                fetchPriority="high"
              />

            </Link>
          </div> */}

            {/* Navigation - Desktop */}
            <nav className="hidden md:flex h-full items-center space-x-10 font-serif tracking-wider text-sm uppercase">
              <Link to={withWholesale("/inicio")} className="text-gray-300 hover:text-amber-300 transition-all duration-300">Inicio</Link>


              {/* Dropdown de Productos */}
              <div className="relative h-full flex items-center" ref={productsDropdownRef}
                onMouseEnter={() => {
                  if (productsCloseTimer.current) clearTimeout(productsCloseTimer.current);
                  setProductsDropdownOpen(true);
                }}
                onMouseLeave={() => {
                  if (productsCloseTimer.current) clearTimeout(productsCloseTimer.current);
                  productsCloseTimer.current = setTimeout(() => {
                    setProductsDropdownOpen(false);
                  }, 180);
                }}
              >
                <button
                  onClick={() => setProductsDropdownOpen(!productsDropdownOpen)}
                  className="flex items-center text-gray-300 hover:text-amber-300 transition-all duration-300 bg-transparent p-0 border-0 rounded-none appearance-none focus:outline-none focus:ring-0 hover:bg-transparent active:bg-transparent uppercase"
                  style={{ backgroundColor: 'transparent', boxShadow: 'none' }}
                >

                  Productos
                  <svg
                    className={`ml-1 w-4 h-4 transition-transform ${productsDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                <div
                  className={`absolute left-0 top-full -mt-px w-72 bg-[#111113]
  rounded-b-xl rounded-t-none
  shadow-2xl border border-amber-500/20 border-t-0
  backdrop-blur-lg z-50 overflow-hidden
  transition-all duration-200 ease-out
  ${productsDropdownOpen ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-2 invisible"}
`}
                >

                  <div className="pt-3 pb-2 border-t-2 border-amber-500/60">
                    <Link
                      to={withWholesale("/products")}
                      className="flex items-center px-5 py-3 text-sm text-gray-300 hover:text-amber-300 hover:bg-[#1a1a1d] transition-all duration-200"
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        setProductsDropdownOpen(false);
                      }}

                    >
                      Ver todos los productos
                    </Link>
                    {productCategories.map((category) => (
                      <Link
                        key={category.route}
                        to={withWholesale(category.route)}
                        className="block px-5 py-3 text-sm text-gray-300 hover:text-amber-300 hover:bg-[#1a1a1d] transition-all duration-200 border-b border-amber-500/10"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                          setProductsDropdownOpen(false);
                        }}
                      >
                        <span className="mr-3 text-base opacity-80">{category.icon}</span>
                        {category.name}
                      </Link>
                    ))}
                  </div>
                </div>

              </div>

              {/*  <Link
              to="/mayorista"
              className="text-gray-300 hover:text-amber-300 transition-all duration-300"
            >
              Mayoristas
            </Link> */}
              <a
                href={withWholesale("/inicio") + "#asesoria"}
                onClick={goToContact}
                className="text-gray-300 hover:text-amber-300 transition-all duration-300"
              >
                Contacto
              </a>
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center space-x-4 text-white ml-8">
              <AccountDropdown />
              {/* Lupa Desktop */}

              <button
                type="button"
                onClick={() => setMobileSearchOpen(v => !v)}   // <-- CAMBIO: antes tenías navigate("/busqueda")
                className="hover:text-purple-400 transition-colors bg-transparent border-0 p-0"
                aria-label="Buscar productos"
                title="Buscar"
              >
                <Search className="w-5 h-5 stroke-[1.5] text-gray-300 hover:text-amber-300 transition-colors duration-300" />
              </button>


              {/* Carrito Desktop */}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative hover:text-purple-400 transition-colors bg-transparent border-0 p-0"
                aria-label="Abrir carrito"
                title="Carrito"
              >
                <ShoppingCart className="w-5 h-5 stroke-[1.5] text-gray-300 hover:text-amber-300 transition-colors duration-300" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-amber-500 text-black font-semibold px-1.5 py-[2px] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile cart - right */}
            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative hover:text-purple-400 transition-colors bg-transparent border-0 p-0 text-white"
                aria-label="Abrir carrito"
                title="Carrito"
              >
                <ShoppingCart className="w-5 h-5 stroke-[1.5] text-gray-300 hover:text-amber-300 transition-colors duration-300" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-amber-500 text-black font-semibold px-1.5 py-[2px] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="md:hidden px-5 pb-4">
            <div className="relative" ref={searchBoxRef}>
              <div className="relative border border-white/35 bg-[#111113] -mx-9 px-4 py-2 rounded-md">
                <input
                  type="text"
                  value={mobileSearchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Buscar"
                  autoFocus
                  className="w-full !bg-transparent !text-white border-0 pr-16 text-[15px] placeholder:text-gray-500 focus:outline-none focus:ring-0 shadow-none"
                  style={{
                    backgroundImage: "linear-gradient(#111113, #111113)",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "100% 100%",
                    WebkitTextFillColor: "#fff",
                  }}
                />

                {mobileSearchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSearchTerm("");
                      setSearchResults([]);
                    }}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-transparent border-0 p-0 text-white hover:text-gray-300"
                    style={{ backgroundColor: "transparent" }}
                  >
                    ✕
                  </button>
                ) : (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-white"
                  >
                    <Search className="h-6 w-6 stroke-[1.5]" />
                  </div>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="absolute left-1/2 top-full z-50 mt-2 max-h-80 w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
                  {searchResults.map((p) => {
                    const wholesalePrice = getWholesaleSearchPrice(p);
                    const retailPrice = getRetailSearchPrice(p);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          const prefix = location.pathname.startsWith("/mayorista") ? "/mayorista" : "";
                          navigate(`${prefix}/product/${p.id}`);
                          setSearchResults([]);
                        }}
                        className="flex items-center gap-3 border-b border-gray-200 p-3 last:border-b-0"
                      >
                        <img
                          src={toAbsUrl(p.image_url) || "/sin_imagen.jpg"}
                          alt={p.name}
                          className="h-12 w-12 object-contain rounded"
                          onError={(e) => {
                            e.currentTarget.src = "/sin_imagen.jpg";
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800">
                            {p.name}
                          </div>
                          <div className="text-sm font-bold text-green-600">
                            {location.pathname.startsWith("/mayorista")
                              ? wholesalePrice && wholesalePrice > 0
                                ? `${formatPrice(wholesalePrice)}`
                                : "Consultar"
                              : retailPrice && retailPrice > 0
                                ? `$${formatPrice(retailPrice)}`
                                : "Consultar"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Search Box desktop */}
          {mobileSearchOpen && (
            <div className="hidden md:block bg-gray-1000 p-3 z-50">
              <div className="flex justify-end px-4 sm:px-6 lg:px-8">
                <div className="static w-full max-w-md" ref={searchBoxRef}>
                  <div className="flex">
                    <input
                      type="text"
                      value={mobileSearchTerm}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Buscar productos..."
                      className="w-full max-w-md p-2 pr-9 rounded-md text-black focus:outline-none"
                      autoFocus
                    />

                    {/* Botón X (limpiar/cerrar) */}
                    {mobileSearchOpen && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSearchTerm("");
                          setSearchResults([]);
                          setMobileSearchOpen(false);
                        }}
                        aria-label="Cerrar búsqueda"
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 text-sm"
                        title="Cerrar"
                      >
                        ✕
                      </button>
                    )}
                  </div>


                  {/* 👇 Caja de resultados: Pegar aquí, dentro del max-w-7xl */}
                  {searchResults.length > 0 && (
                    <div className="absolute top-full w-full mt-1 max-w-md bg-white rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">

                      {searchResults.map((p) => {
                        const wholesalePrice = getWholesaleSearchPrice(p);
                        const retailPrice = getRetailSearchPrice(p);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              const prefix = location.pathname.startsWith("/mayorista") ? "/mayorista" : "";
                              navigate(`${prefix}/product/${p.id}`);
                              setMobileSearchOpen(false);
                            }}

                            className="flex items-center p-3 hover:bg-gray-300 cursor-pointer border-b border-gray-200 last:border-b-0"
                          >
                            <img
                              src={toAbsUrl(p.image_url) || "/sin_imagen.jpg"}
                              alt={p.name}
                              className="w-12 h-12 object-contain rounded mr-3"
                              onError={(e) => { e.currentTarget.src = "/sin_imagen.jpg"; }}
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-800">{p.name}</div>
                              <div className="text-green-600 font-bold text-sm">
                                {location.pathname.startsWith("/mayorista")
                                  ? (
                                    wholesalePrice && wholesalePrice > 0
                                      ? `${formatPrice(wholesalePrice)}`
                                      : "Consultar"
                                  )
                                  : (retailPrice && retailPrice > 0
                                    ? `$${formatPrice(retailPrice)}`
                                    : "Consultar")
                                }
                              </div>

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* 👆 Fin caja de resultados */}
                </div>
              </div>
            </div>
          )}


          {/* Mobile Menu */}
          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="md:hidden absolute left-0 right-0 top-full z-50">
              <div
                ref={mobileMenuRef}
                className="bg-[#111113] shadow-xl border-t border-amber-500/20 px-4 pt-1 pb-5 space-y-3 font-serif tracking-wide"
              >
                {/* Botón X dedicado para cerrar */}
                <div className="flex justify-end -mt-1 -mr-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }}
                    aria-label="Cerrar menú"
                    className="bg-transparent border-0 p-3 text-white hover:text-amber-300 flex items-center justify-center"
                    style={{ backgroundColor: 'transparent' }}
                  >
                    <svg className="w-5 h-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <Link
                  to={withWholesale("/inicio")}
                  className="block text-gray-200 hover:text-amber-300 transition-all duration-300 text-lg"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Inicio
                </Link>

                {/* Productos en mobile */}
                <div className="pt-2">
                  <span className="block text-gray-400 text-sm uppercase tracking-wider mb-2">
                    Productos
                  </span>

                  <div className="border-l border-amber-500/30 pl-4 space-y-2">

                    <Link
                      to={withWholesale("/products")}
                      className="block text-gray-200 hover:text-amber-300 transition-all duration-300"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Ver todos los productos
                    </Link>

                    {productCategories.map((category) => (
                      <Link
                        key={category.route}
                        to={withWholesale(category.route)}
                        className="block text-gray-300 hover:text-amber-300 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {category.icon} {category.name}
                      </Link>
                    ))}

                  </div>
                </div>

                <a
                  href={withWholesale("/inicio") + "#asesoria"}
                  onClick={goToContact}

                  className="block pt-4 mt-3 border-t border-gray-700 text-gray-200 hover:text-amber-300 transition-colors text-lg"
                >
                  Contacto
                </a>

                {/* Mobile: Ingresar solo si NO hay usuario */}
                {
                  store.user && (
                    <div className="border-t border-gray-700 pt-2">

                      <div className="px-3 py-2 text-sm text-gray-300">
                        Hola Administrador
                      </div>

                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          navigate("/admin/login");
                        }}
                        className="block w-full text-left px-3 py-2 hover:text-amber-300 transition-all duration-300"
                      >
                        Panel Admin
                      </button>

                      <button
                        onClick={() => {
                          actions.logoutUser();
                          setIsMenuOpen(false);
                        }}
                        className="block w-full text-left px-3 py-2 hover:text-amber-300 transition-all duration-300"
                      >
                        Cerrar sesión
                      </button>

                    </div>
                  )
                }
              </div>
            </div>
          )}
        </div>
        <Cart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      </header>

      <div className="block md:hidden h-[128px]" aria-hidden="true" />
    </>
  );
}

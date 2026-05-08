import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { withWholesale } from '../utils/navigation.js'
import { PERFUME_CATEGORY_DEFINITIONS as FOOTER_CATEGORIES } from '../utils/perfumeCategories.js'

/* import logofooter from "../assets/logofooter.png"; */
import { storeConfig } from "../config/storeConfig";

const logofooter = `/${storeConfig.media.footerLogo}`;

const phone = storeConfig.contact.whatsapp;
const message = encodeURIComponent(storeConfig.contact.whatsappMessage);
const link = `https://wa.me/${phone}?text=${message}`;

const Footer = () => {
    const navigate = useNavigate();
    return (
        <div>
            <footer className="bg-[#0b0b0d] text-gray-300 py-12 font-serif">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center md:text-left">
                        <div className="flex flex flex-col items-center">
                            <img
                                src={logofooter}
                                alt="Shatha"
                                className="h-[150px] w-[180px] md:h-[120px] md:w-[220px] mt-[-20px] md:mt-[-10px] mb-[10px] md:mb-[20px] opacity-95 object-contain"
                            />

                            <p className="text-gray-400 text-sm max-w-xs -mt-5 text-center">
                                {storeConfig.branding.footerText}
                            </p>
                        </div>


                        {/* 🟢 Productos */}
                        <div>
                            <h4 className="font-semibold mb-4 uppercase tracking-wider text-sm text-gray-200">Productos</h4>
                            <ul className="space-y-2 text-gray-400">
                                {FOOTER_CATEGORIES.map((c) => (
                                    <li key={c.slug}>
                                        <Link
                                            to={withWholesale(`/categoria/${c.slug}`)}
                                            state={{ fromFooter: true }}     // 👈 Marca que viene desde el footer
                                            className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full"
                                        >
                                            {c.name}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* <div>
                            <h4 className="font-semibold mb-4 uppercase tracking-wider text-sm text-gray-200">Información</h4>
                            <ul className="space-y-2 text-gray-400">
                                <li>
                                    <Link
                                        to={withWholesale("/aviso-legal")}

                                        className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full"
                                    >
                                        Aviso Legal
                                    </Link>
                                </li>
                                <li>
                                    <Link to={withWholesale("/envios")}
                                        className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full">
                                        Envíos
                                    </Link>
                                </li>
                                <li>
                                    <Link to={withWholesale("/devoluciones")}
                                        className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full">
                                        Devoluciones
                                    </Link>
                                </li>

                            </ul>
                        </div>
 */}
                        <div>
                            <h4 className="font-semibold mb-4 uppercase tracking-wider text-sm text-gray-200">Contacto</h4>
                            <ul className="space-y-2 text-gray-300">
                                <li>
                                    <a
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full"
                                    >
                                        WhatsApp: {storeConfig.contact.whatsappDisplay}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={`mailto:${storeConfig.contact.email}`}
                                        className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full"
                                    >
                                        {storeConfig.contact.emailDisplay}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={storeConfig.contact.instagram}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="relative hover:text-amber-300 transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-[1px] after:bg-amber-400 after:transition-all after:duration-300 hover:after:w-full"
                                    >
                                        Instagram: {storeConfig.contact.instagramDisplay}
                                    </a>
                                </li>
                            </ul>
                        </div>

                    </div>

                    <div className="border-t border-yellow-600/20 mt-8 pt-8 text-center text-gray-400 text-xs">
                        <p>
                            Copyright © <span
                                onDoubleClick={() => {
                                    navigate("/admin/login");
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="cursor-default select-none"
                            >
                                2026
                            </span> | {storeConfig.footer.copyrightName} | Sitio web desarrollado por{" "}
                            <a
                                href="https://wa.me/5493534793366?text=Hola%2C%20vi%20tu%20web%20y%20quiero%20consultarte%20por%20un%20catálogo%20para%20mi%20negocio"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-white transition-colors font-medium"
                            >
                                {storeConfig.footer.developerName}
                            </a>.
                        </p>
                    </div>

                </div>
            </footer>
        </div>
    )
}

export default Footer

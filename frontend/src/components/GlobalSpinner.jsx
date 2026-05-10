import React, { useEffect, useRef, useState } from "react";
import Spinner from "../assets/spinner_lean.gif";

const GlobalSpinner = ({ appReady = false }) => {
    const [visible, setVisible] = useState(true);
    const spinnerImgRef = useRef(null);
    const cancelledRef = useRef(false);

    useEffect(() => {
        if (!appReady) {
            setVisible(true);
            cancelledRef.current = false;
            return;
        }

        let pollTimeout = null;
        let fallbackTimeout = null;
        cancelledRef.current = false;

        const checkImages = () => {
            if (cancelledRef.current) return;

            const images = Array.from(document.images).filter(
                (img) => img !== spinnerImgRef.current
            );

            // Filtrar imágenes que tienen un tamaño natural (cargadas correctamente)
            const allLoaded = images.every((img) => {
                return img.complete && (img.naturalHeight > 0 || img.naturalWidth > 0 || img.src.includes("data:"));
            });

            if (allLoaded && images.length > 0) {
                setTimeout(() => {
                    if (!cancelledRef.current) setVisible(false);
                }, 250);
                return;
            }

            // Esperar más tiempo en la primera carga
            const delay = images.length === 0 ? 150 : 120;
            pollTimeout = window.setTimeout(checkImages, delay);
        };

        // Timeout máximo de 10 segundos (más tiempo para conexiones lentas)
        fallbackTimeout = window.setTimeout(() => {
            if (!cancelledRef.current) {
                console.warn("GlobalSpinner: Timeout esperando imágenes. Cerrando spinner...");
                setVisible(false);
            }
        }, 10000);

        // Escuchar evento personalizado de InicioNuevo
        const handleInicioImagesReady = () => {
            if (!cancelledRef.current) {
                setVisible(false);
            }
        };
        window.addEventListener("inicioImagesReady", handleInicioImagesReady);

        requestAnimationFrame(checkImages);

        return () => {
            cancelledRef.current = true;
            if (pollTimeout) window.clearTimeout(pollTimeout);
            if (fallbackTimeout) window.clearTimeout(fallbackTimeout);
            window.removeEventListener("inicioImagesReady", handleInicioImagesReady);
        };
    }, [appReady]);

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
            <img ref={spinnerImgRef} src={Spinner} alt="Loading" className="w-54 h-54" />
        </div>
    );
};

export default GlobalSpinner;

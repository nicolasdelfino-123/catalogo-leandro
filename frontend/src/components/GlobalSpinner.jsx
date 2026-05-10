import React, { useEffect, useState } from "react";
import Spinner from "../assets/spinner_lean.gif";

const loadImage = (src) =>
    new Promise((resolve) => {
        if (!src) {
            resolve();
            return;
        }

        const img = new Image();

        const finish = () => {
            if (img.decode) {
                img.decode().then(resolve).catch(resolve);
                return;
            }

            resolve();
        };

        img.onload = finish;
        img.onerror = resolve;
        img.src = src;
    });

const GlobalSpinner = ({ appReady = false, criticalImages = [] }) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        let cancelled = false;

        if (!appReady) {
            setVisible(true);
        } else {
            Promise.all(criticalImages.map(loadImage)).then(() => {
                if (!cancelled) setVisible(false);
            });
        }

        return () => {
            cancelled = true;
        };
    }, [appReady, criticalImages]);


    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
            <img src={Spinner} alt="Loading" className="w-54 h-54" />
        </div>
    );
};

export default GlobalSpinner;

export const PERFUME_CATEGORY_DEFINITIONS = [
    { id: 1, name: "Masculinos", slug: "masculinos" },
    { id: 2, name: "Femeninos", slug: "femeninos" },
    { id: 3, name: "Unisex", slug: "unisex" },
];

export const PERFUME_CATEGORY_NAMES = PERFUME_CATEGORY_DEFINITIONS.map((category) => category.name);

export const CATEGORY_ID_TO_NAME = {
    1: "Masculinos",
    2: "Femeninos",
    3: "Unisex",
    4: "Masculinos",
    5: "Femeninos",
    6: "Masculinos",
    7: "Masculinos",
};

export const CATEGORY_NAME_TO_ID = {
    Masculinos: 1,
    "Perfumes masculinos": 1,
    "Perfumes Masculinos": 1,
    "Fragancias de Hombre": 1,
    "Vapes Desechables": 1,
    "Perfumes de Diseñador": 1,
    "Perfumes de Disenador": 1,
    Resistencias: 1,
    Perfumes: 1,
    Femeninos: 2,
    "Fragancias de Mujer": 2,
    "Pods Recargables": 2,
    "Productos Karseell": 2,
    "Líquidos": 2,
    Celulares: 2,
    "Body splash victoria secret": 2,
    "Body Splash Victoria Secret": 2,
    Unisex: 3,
};

export const LEGACY_CATEGORY_NAME_TO_CURRENT = {
    "Fragancias de Hombre": "Masculinos",
    "Fragancias de Mujer": "Femeninos",
    "Vapes Desechables": "Masculinos",
    "Pods Recargables": "Femeninos",
    "Líquidos": "Femeninos",
    Resistencias: "Masculinos",
    Celulares: "Femeninos",
    Perfumes: "Masculinos",
    "Productos Karseell": "Femeninos",
    Unisex: "Unisex",
    "Body splash victoria secret": "Femeninos",
    "Body Splash Victoria Secret": "Femeninos",
    "Perfumes de Diseñador": "Masculinos",
    "Perfumes de Disenador": "Masculinos",
};

export const SLUG_TO_NAME = {
    masculinos: "Masculinos",
    femeninos: "Femeninos",
    unisex: "Unisex",
    "perfumes-masculinos": "Masculinos",
    perfumes: "Masculinos",
    "vapes-desechables": "Masculinos",
    resistencias: "Masculinos",
    "perfumes-de-disenador": "Masculinos",
    "pods-recargables": "Femeninos",
    liquidos: "Femeninos",
    celulares: "Femeninos",
    "body-splash-victoria-secret": "Femeninos",
};

export const SLUG_TO_ID = {
    masculinos: 1,
    femeninos: 2,
    unisex: 3,
    "perfumes-masculinos": 1,
    perfumes: 1,
    "vapes-desechables": 1,
    resistencias: 1,
    "perfumes-de-disenador": 1,
    "pods-recargables": 2,
    liquidos: 2,
    celulares: 2,
    "body-splash-victoria-secret": 2,
};

export const NAME_TO_SLUG = {
    Masculinos: "masculinos",
    "Perfumes masculinos": "masculinos",
    "Perfumes Masculinos": "masculinos",
    "Fragancias de Hombre": "masculinos",
    "Vapes Desechables": "masculinos",
    Resistencias: "masculinos",
    Perfumes: "masculinos",
    "Perfumes de Diseñador": "masculinos",
    "Perfumes de Disenador": "masculinos",
    Femeninos: "femeninos",
    "Fragancias de Mujer": "femeninos",
    "Pods Recargables": "femeninos",
    "Productos Karseell": "femeninos",
    "Líquidos": "femeninos",
    Celulares: "femeninos",
    "Body splash victoria secret": "femeninos",
    "Body Splash Victoria Secret": "femeninos",
    Unisex: "unisex",
};

export const mapCategoryIdFromName = (value = "") => {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (normalized.includes("unisex")) {
        return 3;
    }

    if (
        normalized.includes("femen") ||
        normalized.includes("mujer") ||
        normalized.includes("pod") ||
        normalized.includes("karseell") ||
        normalized.includes("liquido") ||
        normalized.includes("celular") ||
        normalized.includes("body") ||
        normalized.includes("victoria")
    ) {
        return 2;
    }

    return 1;
};

export const getNormalizedCategoryId = (product) => {
    const byId = CATEGORY_ID_TO_NAME[Number(product?.category_id)];
    if (byId) return CATEGORY_NAME_TO_ID[byId] || 1;

    const raw = String(product?.category_name || "").trim();
    if (!raw) return 1;

    return CATEGORY_NAME_TO_ID[LEGACY_CATEGORY_NAME_TO_CURRENT[raw] || raw] || mapCategoryIdFromName(raw);
};

export const getDisplayCategoryName = (product) => {
    const normalizedId = getNormalizedCategoryId(product);
    return CATEGORY_ID_TO_NAME[normalizedId] || "Masculinos";
};

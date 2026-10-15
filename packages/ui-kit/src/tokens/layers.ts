// Mirrors the --mv-z-* variables in styles/tokens.css; for libraries configured from JS.
export const layers = {
    sticky: 100,
    dropdown: 200,
    floating: 300,
    overlay: 400,
    modal: 500,
    popover: 600,
    connectionBar: 700,
    toast: 800,
} as const;

export type LayerToken = keyof typeof layers;

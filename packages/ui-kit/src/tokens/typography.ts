export const typography = {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: {
        table: '13px',
        body: '14px',
        button: '14px',
        search: '16px',
        title: '20px',
    },
} as const;

export type FontSizeToken = keyof typeof typography.fontSize;

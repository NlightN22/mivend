export const colors = {
    primary: '#00B894',
    primaryHover: '#00A884',
    primaryLight: '#45D6B7',
    primarySoft: '#F0FFFA',
    accentLime: '#C8F21A',
    accentOrange: '#FF8A00',
    pageBg: '#F6F8FB',
    surface: '#FFFFFF',
    catalogBg: '#F2FFF8',
    catalogActive: '#D9FFE9',
    textPrimary: '#17212B',
    textSecondary: '#667085',
    border: '#E4E7EC',
} as const;

export type ColorToken = keyof typeof colors;

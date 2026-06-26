export const spacing = {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '48px',
} as const;

export const radius = {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
} as const;

export const shadows = {
    sm: '0 6px 18px rgba(16, 24, 40, 0.05)',
    md: '0 10px 28px rgba(16, 24, 40, 0.08)',
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadows;

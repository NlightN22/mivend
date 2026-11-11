export const CATEGORICAL_VARIANTS = [
    'cat-1',
    'cat-2',
    'cat-3',
    'cat-4',
    'cat-5',
    'cat-6',
    'cat-7',
    'cat-8',
] as const;

export type CategoricalVariant = (typeof CATEGORICAL_VARIANTS)[number];

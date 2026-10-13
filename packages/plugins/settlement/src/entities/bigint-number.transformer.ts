import type { ValueTransformer } from 'typeorm';

export const bigintNumber: ValueTransformer = {
    to: (value: number | null | undefined): number | null | undefined => value,
    from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

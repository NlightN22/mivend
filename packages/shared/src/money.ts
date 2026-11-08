import type { ValueTransformer } from 'typeorm';

export function toMinorUnits(major: number): number {
    if (!Number.isFinite(major)) throw new Error(`Invalid amount: ${major}`);
    const scaled = Math.round(Number((Math.abs(major) * 100).toPrecision(15)));
    return major < 0 ? -scaled : scaled;
}

// bigint columns come back from pg as strings.
export const bigintNumber: ValueTransformer = {
    to: (value: number | null | undefined): number | null | undefined => value,
    from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

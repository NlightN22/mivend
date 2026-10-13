export function toMinorUnits(major: number): number {
    if (!Number.isFinite(major)) throw new Error(`Invalid settlement amount: ${major}`);
    const scaled = Math.round(Number((Math.abs(major) * 100).toPrecision(15)));
    return major < 0 ? -scaled : scaled;
}

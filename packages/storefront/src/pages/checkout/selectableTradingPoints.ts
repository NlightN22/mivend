export function selectableTradingPoints<T extends { isActive: boolean }>(points: T[]): T[] {
    return points.filter(p => p.isActive);
}

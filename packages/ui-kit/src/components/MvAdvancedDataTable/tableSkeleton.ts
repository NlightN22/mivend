export const MAX_SKELETON_ROWS = 10;

export function skeletonRowCount(pageSize: number): number {
    return Math.max(1, Math.min(pageSize, MAX_SKELETON_ROWS));
}

export function skeletonRows(dataKey: string, count: number): Record<string, string>[] {
    return Array.from({ length: count }, (_, i) => ({ [dataKey]: `__skeleton-${i}` }));
}

export function isSkeletonRow(row: Record<string, unknown>, dataKey: string): boolean {
    return String(row[dataKey]).startsWith('__skeleton-');
}

const EXACT_BELOW = 10_000;

export function formatExactCount(count: number): string {
    return count.toLocaleString('en-US');
}

// 309861 -> "309.9k", 1250000 -> "1.3M"; below 10,000 the exact value is short enough.
export function formatCompactCount(count: number): string {
    if (count < EXACT_BELOW) return formatExactCount(count);
    const thousands = Math.round(count / 100) / 10;
    if (thousands < 1000) return `${thousands}k`;
    return `${Math.round(count / 100_000) / 10}M`;
}

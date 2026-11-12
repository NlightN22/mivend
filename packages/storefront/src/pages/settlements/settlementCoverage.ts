export const COVERAGE_THRESHOLD_MINOR = 100;

export interface CoverageGap {
    currency: string;
    unexplained: number;
}

export function unexplainedByCurrency(
    balances: readonly { currency: string; unexplained: number | string }[],
): CoverageGap[] {
    const sums = new Map<string, number>();
    for (const b of balances) {
        sums.set(b.currency, (sums.get(b.currency) ?? 0) + Number(b.unexplained));
    }
    return [...sums]
        .filter(([, unexplained]) => Math.abs(unexplained) >= COVERAGE_THRESHOLD_MINOR)
        .map(([currency, unexplained]) => ({ currency, unexplained }));
}

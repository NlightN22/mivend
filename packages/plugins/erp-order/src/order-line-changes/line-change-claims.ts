import type { LineChangeSource } from './line-change.types';

// A worked-out claim and the sales correction it produces are one return: per product the claim quantity is
// consumed by the corrections' decreases (oldest claim first); only the uncovered part stays, money pro rata.
export function netClaimsAgainstCorrections(sources: LineChangeSource[]): LineChangeSource[] {
    const covered = new Map<string, number>();
    for (const s of sources) {
        if (s.kind === 'realization-correction' && s.productErpId && s.quantity < 0) {
            covered.set(s.productErpId, (covered.get(s.productErpId) ?? 0) - s.quantity);
        }
    }
    const claims = sources
        .filter(s => s.kind === 'return' && s.productErpId && s.quantity < 0)
        .sort(
            (a, b) =>
                (a.documentDate?.getTime() ?? Infinity) - (b.documentDate?.getTime() ?? Infinity) ||
                a.documentNumber.localeCompare(b.documentNumber),
        );
    const rest = new Map<LineChangeSource, LineChangeSource | null>();
    for (const claim of claims) {
        const available = covered.get(claim.productErpId) ?? 0;
        const taken = Math.min(available, -claim.quantity);
        covered.set(claim.productErpId, available - taken);
        const left = -claim.quantity - taken;
        rest.set(
            claim,
            left <= 0
                ? null
                : {
                      ...claim,
                      quantity: -left,
                      amountMinor: Math.round((claim.amountMinor * left) / -claim.quantity),
                  },
        );
    }
    return sources.flatMap(s => (rest.has(s) ? (rest.get(s) ?? []) : [s]));
}

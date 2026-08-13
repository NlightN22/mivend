// Integration Service's `version` field is a plain string (see integration-inbox-event.entity.ts's
// column comment) — not guaranteed fixed-width, so a SQL/lexicographic `>` comparison is wrong for
// numeric strings of different lengths (e.g. "9" vs "10"). Compare as BigInt when both sides parse
// cleanly as an integer; fall back to lexicographic string comparison otherwise (still correct for
// non-numeric version schemes, and no worse than what the source system itself guarantees).
export function isVersionNewer(candidate: string, than: string): boolean {
    const a = tryParseBigInt(candidate);
    const b = tryParseBigInt(than);
    if (a !== undefined && b !== undefined) return a > b;
    return candidate > than;
}

function tryParseBigInt(value: string): bigint | undefined {
    if (!/^\d+$/.test(value)) return undefined;
    try {
        return BigInt(value);
    } catch {
        return undefined;
    }
}

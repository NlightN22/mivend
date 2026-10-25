// Mirrors plugin-erp-integration's version-compare.ts — domain plugins never depend on erp-integration.
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

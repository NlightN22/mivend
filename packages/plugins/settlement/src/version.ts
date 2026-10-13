function comparable(version: string): number | bigint | null {
    if (/^\d+$/.test(version)) return BigInt(version);
    const time = Date.parse(version);
    return Number.isNaN(time) ? null : time;
}

// Equal versions are not newer; unparsable versions fall back to string order.
export function isNewerVersion(candidate: string, stored: string): boolean {
    const a = comparable(candidate);
    const b = comparable(stored);
    if (a !== null && b !== null && typeof a === typeof b) return a > b;
    return candidate > stored;
}

// A tombstone wins a version tie so a same-version delayed upsert cannot resurrect it.
export function shouldApplyDocument(
    incoming: { version: string; isDeleted: boolean },
    stored: { version: string; isDeleted: boolean } | null,
): boolean {
    if (!stored) return true;
    if (isNewerVersion(incoming.version, stored.version)) return true;
    return (
        incoming.isDeleted && !stored.isDeleted && !isNewerVersion(stored.version, incoming.version)
    );
}

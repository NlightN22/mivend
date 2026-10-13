const ISO_DATE =
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function isoTime(version: string): number | null {
    if (!ISO_DATE.test(version)) return null;
    const time = Date.parse(version);
    return Number.isNaN(time) ? null : time;
}

// Both ISO dates compare as time, both integers as numbers; any other pair falls back to string
// order and the two kinds are never mixed.
export function isNewerVersion(candidate: string, stored: string): boolean {
    const candidateTime = isoTime(candidate);
    const storedTime = isoTime(stored);
    if (candidateTime !== null && storedTime !== null) return candidateTime > storedTime;
    if (/^\d+$/.test(candidate) && /^\d+$/.test(stored)) return BigInt(candidate) > BigInt(stored);
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

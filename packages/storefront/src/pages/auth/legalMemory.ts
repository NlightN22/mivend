const STORAGE_KEY = 'mv.legalAccepted';

// Accepted version per required kind, remembered per sign-in identifier in this browser.
type Remembered = Record<string, Record<string, number>>;

interface Required {
    kind: string;
    requiredVersion: number;
}

function read(): Remembered {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Remembered;
    } catch {
        return {};
    }
}

// A fingerprint keeps addresses out of a possibly shared browser's storage; a collision only hides the boxes.
export function fingerprint(identifier: string): string {
    let hash = 0x811c9dc5;
    for (const char of identifier.trim().toLowerCase()) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    return hash.toString(16);
}

// The browser only hints; the server decides. A minor edit keeps the hint, a re-acceptance version drops it.
export function acceptanceRemembered(identifier: string, required: Required[]): boolean {
    const known = read()[fingerprint(identifier)] ?? {};
    return required.every(r => (known[r.kind] ?? 0) >= r.requiredVersion);
}

export function rememberAcceptance(
    identifiers: string[],
    accepted: { kind: string; version: number }[],
): void {
    const map = read();
    const versions = Object.fromEntries(accepted.map(a => [a.kind, a.version]));
    for (const identifier of identifiers) {
        if (identifier.trim()) map[fingerprint(identifier)] = versions;
    }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Storage can be blocked; the boxes are simply shown again next time.
    }
}

import { LEGAL_KIND_RULES, LEGAL_KINDS } from './legal-kinds';
import type { LegalKind } from './legal-kinds';

export interface PublishedVersion {
    kind: string;
    version: number;
    requiresReacceptance: boolean;
}

// Records of one customer, newest last.
export interface AcceptanceRecord {
    kind: string;
    version: number;
    accepted: boolean;
}

export interface DocumentStatus {
    kind: LegalKind;
    version: number;
    required: boolean;
    accepted: boolean;
    pending: boolean;
}

// A version flagged requiresReacceptance resets the question; a minor edit keeps earlier answers valid.
function requiredVersion(versions: PublishedVersion[], current: number): number {
    const flagged = versions.filter(v => v.requiresReacceptance && v.version <= current);
    return flagged.length
        ? Math.max(...flagged.map(v => v.version))
        : Math.min(...versions.map(v => v.version));
}

export function documentStatuses(
    published: PublishedVersion[],
    records: AcceptanceRecord[],
): DocumentStatus[] {
    const statuses: DocumentStatus[] = [];
    for (const kind of LEGAL_KINDS) {
        const rule = LEGAL_KIND_RULES[kind];
        const versions = published.filter(v => v.kind === kind);
        if (!rule.acceptable || versions.length === 0) continue;
        const current = Math.max(...versions.map(v => v.version));
        const latest = records.filter(r => r.kind === kind).at(-1);
        const answered = !!latest && latest.version >= requiredVersion(versions, current);
        const accepted = latest?.accepted ?? false;
        statuses.push({
            kind,
            version: current,
            required: rule.required,
            accepted,
            pending: rule.required ? !(answered && accepted) : !answered,
        });
    }
    return statuses;
}

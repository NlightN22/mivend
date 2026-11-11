export interface LegalNameAbbreviationRule {
    phrase: string;
    abbreviation: string;
}

export function normalizePhrase(phrase: string): string {
    return phrase.trim().replace(/\s+/g, ' ');
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phrasePattern(phrase: string): string {
    return normalizePhrase(phrase).split(' ').map(escapeRegExp).join('\\s+');
}

// Whole-phrase, case-insensitive; one alternation sorted longest first so the longest phrase wins at a position.
export function abbreviateLegalName(name: string, rules: LegalNameAbbreviationRule[]): string {
    const usable = rules.filter(rule => normalizePhrase(rule.phrase) !== '');
    if (usable.length === 0) return name;
    const sorted = [...usable].sort(
        (a, b) => normalizePhrase(b.phrase).length - normalizePhrase(a.phrase).length,
    );
    const byKey = new Map(
        sorted.map(rule => [normalizePhrase(rule.phrase).toLowerCase(), rule.abbreviation]),
    );
    const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${sorted.map(rule => phrasePattern(rule.phrase)).join('|')})(?![\\p{L}\\p{N}])`,
        'giu',
    );
    let matched = false;
    const replaced = name.replace(pattern, found => {
        matched = true;
        return byKey.get(found.replace(/\s+/g, ' ').toLowerCase()) ?? found;
    });
    return matched ? replaced.replace(/\s+/g, ' ').trim() : name;
}

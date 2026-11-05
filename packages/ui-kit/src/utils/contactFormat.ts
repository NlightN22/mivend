const NAME_ALLOWED = /[^\p{L}\s'’.-]/gu;

function capitalizeWord(word: string): string {
    return word.replace(
        /(^|[-'’])(\p{L})(\p{L}*)/gu,
        (_m, sep: string, first: string, rest: string) =>
            sep + first.toUpperCase() + rest.toLowerCase(),
    );
}

export function formatPersonName(raw: string): string {
    return raw
        .replace(NAME_ALLOWED, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s+/, '')
        .split(' ')
        .map(capitalizeWord)
        .join(' ');
}

export function applyNameInput(raw: string, caret: number): { value: string; caret: number } {
    return { value: formatPersonName(raw), caret: formatPersonName(raw.slice(0, caret)).length };
}

export function isValidPersonName(raw: string): boolean {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every(w => /\p{L}{2,}|^\p{L}\.$/u.test(w));
}

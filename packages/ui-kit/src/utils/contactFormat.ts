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

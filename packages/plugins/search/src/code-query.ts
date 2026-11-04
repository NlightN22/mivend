export type CodeKind = 'sku' | 'partNumber' | 'manufacturerCode';

// Order is the priority: a product belongs to the first group that matches it.
export const CODE_KINDS: readonly CodeKind[] = ['sku', 'partNumber', 'manufacturerCode'];

const SEPARATORS = /[\s._\-/]+/g;
const CODE_TOKEN = /^[\p{L}\p{N}._\-/]*\p{N}[\p{L}\p{N}._\-/]*$/u;

export function normalizeCode(value: string): string {
    return value.toLowerCase().replace(SEPARATORS, '');
}

// A code is a token with at least one digit; separators inside it are ignored when matching.
export function extractCodes(term: string): string[] {
    const codes = term
        .split(/\s+/)
        .filter(token => CODE_TOKEN.test(token))
        .map(normalizeCode)
        .filter(code => code !== '');
    return [...new Set(codes)];
}

export function skuMatchReasons(sku: string, codes: string[]): string[] {
    const normalizedSku = normalizeCode(sku);
    const lowerSku = sku.toLowerCase();
    const reasons = new Set<string>();
    for (const code of codes) {
        if (lowerSku === code) reasons.add('exactSku');
        else if (normalizedSku === code) reasons.add('exactNormalizedSku');
        else if (normalizedSku.startsWith(code)) reasons.add('prefixSku');
    }
    return [...reasons];
}

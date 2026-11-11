import { CATEGORICAL_VARIANTS, type StatusBadgeVariant } from '@mivend/ui-kit';

// FNV-1a: stable across reloads and lists, so a type keeps one colour wherever it is shown.
function hash(code: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < code.length; i++) {
        h = Math.imul(h ^ code.charCodeAt(i), 0x01000193) >>> 0;
    }
    return h;
}

export function documentTypeVariant(documentType: string): StatusBadgeVariant {
    return CATEGORICAL_VARIANTS[hash(documentType) % CATEGORICAL_VARIANTS.length];
}

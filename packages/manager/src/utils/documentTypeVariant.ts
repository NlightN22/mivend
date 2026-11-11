import { CATEGORICAL_VARIANTS, type StatusBadgeVariant } from '@mivend/ui-kit';

// FNV-1a fallback for a code missing from the list.
function hash(code: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < code.length; i++) {
        h = Math.imul(h ^ code.charCodeAt(i), 0x01000193) >>> 0;
    }
    return h;
}

// Position in the sorted list of all known types gives distinct colours; the hash only covers unknown codes.
export function documentTypeVariant(
    documentType: string,
    sortedCodes: string[] = [],
): StatusBadgeVariant {
    const index = sortedCodes.indexOf(documentType);
    const n = CATEGORICAL_VARIANTS.length;
    return CATEGORICAL_VARIANTS[index >= 0 ? index % n : hash(documentType) % n];
}

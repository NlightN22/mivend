import { describe, expect, it } from 'vitest';
import { CATEGORICAL_VARIANTS } from '@mivend/ui-kit';
import { documentTypeVariant } from '../../utils/documentTypeVariant';

describe('documentTypeVariant', () => {
    it('is stable for the same code and categorical', () => {
        expect(documentTypeVariant('type-a')).toBe(documentTypeVariant('type-a'));
        expect(CATEGORICAL_VARIANTS).toContain(documentTypeVariant('type-a'));
    });

    it('spreads many codes over most variants', () => {
        const used = new Set(
            Array.from({ length: 40 }, (_, i) => documentTypeVariant(`document-type-${i}`)),
        );
        expect(used.size).toBeGreaterThanOrEqual(6);
    });

    it('gives the first 8 sorted codes distinct colours, independent of anything else', () => {
        const codes = Array.from({ length: 12 }, (_, i) => `type-${String(i).padStart(2, '0')}`);
        const first = codes.slice(0, 8).map(c => documentTypeVariant(c, codes));
        expect(new Set(first).size).toBe(8);
        expect(documentTypeVariant(codes[9], codes)).toBe(documentTypeVariant(codes[9], codes));
    });

    it('falls back to the hash for a code outside the list', () => {
        expect(documentTypeVariant('unknown', ['a'])).toBe(documentTypeVariant('unknown'));
    });
});

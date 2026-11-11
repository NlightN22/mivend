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
});

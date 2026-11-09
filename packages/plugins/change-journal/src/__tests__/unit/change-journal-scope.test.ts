import { describe, expect, it } from 'vitest';

import { excludeEntities, isJournaled } from '../../change-journal-scope';

describe('isJournaled', () => {
    it('static exclusions and owner-chosen runtime exclusions are skipped, the rest journaled', () => {
        expect(isJournaled('Session')).toBe(false);
        expect(isJournaled('ProductVariantPriceEntry')).toBe(true);
        excludeEntities(['ProductVariantPriceEntry']);
        expect(isJournaled('ProductVariantPriceEntry')).toBe(false);
        expect(isJournaled('Counterparty')).toBe(true);
    });
});

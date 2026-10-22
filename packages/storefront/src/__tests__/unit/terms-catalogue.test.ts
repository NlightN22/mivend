import { describe, expect, it } from 'vitest';
import en from '../../i18n/en/terms';
import ru from '../../i18n/ru/terms';
import { TERMS_SECTIONS } from '../../pages/terms/termsSections';

describe('terms catalogue', () => {
    it.each(TERMS_SECTIONS)('section %s has the same number of items in en and ru', section => {
        const enItems = en.terms.sections[section].items;
        const ruItems = ru.terms.sections[section].items;
        expect(enItems.length).toBeGreaterThan(0);
        expect(ruItems).toHaveLength(enItems.length);
    });

    it('lists every catalogue section on the page', () => {
        expect(Object.keys(en.terms.sections)).toEqual([...TERMS_SECTIONS]);
        expect(Object.keys(ru.terms.sections)).toEqual([...TERMS_SECTIONS]);
    });
});

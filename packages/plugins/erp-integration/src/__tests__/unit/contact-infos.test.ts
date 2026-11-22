import { describe, it, expect } from 'vitest';

import { contactFacts, contactRowsToInputs } from '../../handlers/contact-infos';

const row = (type: string, presentation: string, isDefault = false) => ({
    type: { name: type },
    presentation,
    isDefault,
});

describe('contactRowsToInputs', () => {
    it('routes the type names, keeps the default flag and leaves the label empty', () => {
        expect(contactRowsToInputs([row('Телефон', '+7 1', true), row('Прочее', 'x')])).toEqual([
            { type: 'phone', value: '+7 1', label: null, isPrimary: true, comment: null },
            { type: 'other', value: 'x', label: null, isPrimary: false, comment: null },
        ]);
    });
    it('returns an empty list for an absent or empty set', () => {
        expect(contactRowsToInputs(undefined)).toEqual([]);
        expect(contactRowsToInputs([])).toEqual([]);
    });
});

describe('contactFacts', () => {
    it('prefers the default phone and e-mail, else the first', () => {
        const facts = contactFacts(
            contactRowsToInputs([
                row('Телефон', '1'),
                row('Телефон', '2', true),
                row('АдресЭлектроннойПочты', 'a@x.io'),
            ]),
        );
        expect(facts).toMatchObject({ phone: '2', email: 'a@x.io' });
    });
    it('takes an address only when there is exactly one', () => {
        expect(contactFacts(contactRowsToInputs([row('Адрес', 'A')])).soleAddress).toBe('A');
        expect(
            contactFacts(contactRowsToInputs([row('Адрес', 'A'), row('Адрес', 'B')])).soleAddress,
        ).toBeNull();
    });
});

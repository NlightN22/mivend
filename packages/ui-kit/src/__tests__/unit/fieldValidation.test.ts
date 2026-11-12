import { describe, expect, it } from 'vitest';
import {
    contactRowErrors,
    formatEmail,
    isValidAddress,
    isValidEmail,
    isValidWorkingHours,
    tradingPointFieldErrors,
} from '../../utils/fieldValidation';

const base = {
    name: 'Point',
    address: 'Main street 12, office 3',
    contactName: 'Ivan Petrov',
    contactPhone: '+7 (913) 123-45-67',
    workingHours: 'Mon-Fri 9:00-18:00',
    latitude: 10 as number | null,
    longitude: 10 as number | null,
};

describe('field predicates', () => {
    it('needs a street-level address with a digit', () => {
        expect(isValidAddress('Main street 12')).toBe(true);
        expect(isValidAddress('Somewhere')).toBe(false);
        expect(isValidAddress('Main street, centre')).toBe(false);
    });

    it('checks the e-mail shape and strips spaces', () => {
        expect(isValidEmail('a@b.co')).toBe(true);
        expect(isValidEmail('a@b')).toBe(false);
        expect(isValidEmail('a b@c.de')).toBe(false);
        expect(formatEmail(' a @b.co ')).toBe('a@b.co');
    });

    it('accepts hours in any language, rejects only over-long text', () => {
        expect(isValidWorkingHours('9-18')).toBe(true);
        expect(isValidWorkingHours('Круглосуточно')).toBe(true);
        expect(isValidWorkingHours('Пн-Пт, без выходных')).toBe(true);
        expect(isValidWorkingHours('9'.repeat(201))).toBe(false);
    });
});

describe('tradingPointFieldErrors', () => {
    it('accepts a valid form', () => expect(tradingPointFieldErrors(base)).toEqual({}));

    it('flags bad new values, including hours', () => {
        const errors = tradingPointFieldErrors({
            ...base,
            name: ' ',
            address: 'Somewhere',
            contactName: 'Ivan',
            contactPhone: '+7 (913',
            workingHours: 'x'.repeat(201),
        });
        expect(Object.keys(errors).sort()).toEqual([
            'address',
            'contactName',
            'contactPhone',
            'name',
            'workingHours',
        ]);
    });

    it('leaves untouched values alone but checks edited ones', () => {
        const original = { ...base, address: 'Somewhere', workingHours: 'x'.repeat(201) };
        expect(tradingPointFieldErrors(original, original)).toEqual({});
        expect(
            Object.keys(
                tradingPointFieldErrors({ ...original, workingHours: 'y'.repeat(202) }, original),
            ),
        ).toEqual(['workingHours']);
    });

    it('requires a location even when untouched', () => {
        const none = { ...base, latitude: null };
        expect(Object.keys(tradingPointFieldErrors(none, none))).toEqual(['location']);
    });
});

describe('contactRowErrors', () => {
    const row = { name: 'Ivan Petrov', phone: '+7 (913) 123-45-67', email: 'a@b.co' };

    it('accepts a valid row and a row with empty optional fields', () => {
        expect(contactRowErrors(row)).toEqual({});
        expect(contactRowErrors({ ...row, phone: '', email: '' })).toEqual({});
    });

    it('always requires a name but only validates changed values', () => {
        const legacy = { name: 'Ivan', phone: '123', email: 'x' };
        expect(contactRowErrors(legacy, legacy)).toEqual({});
        expect(contactRowErrors({ ...legacy, name: ' ' }, legacy)).toEqual({ name: true });
        expect(
            Object.keys(contactRowErrors({ ...legacy, phone: '45', email: 'y' }, legacy)),
        ).toEqual(['phone', 'email']);
    });
});

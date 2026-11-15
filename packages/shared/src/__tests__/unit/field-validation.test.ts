import { describe, expect, it } from 'vitest';
import {
    datePeriodError,
    isValidAddress,
    isValidEmail,
    isValidIsoDate,
    isValidPersonName,
    isValidPhone,
    isValidWorkingHours,
} from '../../field-validation';

describe('field predicates', () => {
    it('needs an address with a letter and a house number', () => {
        expect(isValidAddress('Main street 12')).toBe(true);
        expect(isValidAddress('Somewhere')).toBe(false);
        expect(isValidAddress('1234567890')).toBe(false);
    });
    it('checks the e-mail shape and length', () => {
        expect(isValidEmail('a@b.co')).toBe(true);
        expect(isValidEmail('a@b')).toBe(false);
        expect(isValidEmail('a b@c.de')).toBe(false);
        expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
    });
    it('needs a full name and a complete phone', () => {
        expect(isValidPersonName('Ivan Petrov')).toBe(true);
        expect(isValidPersonName('Ivanov')).toBe(false);
        expect(isValidPhone('+7 (913) 123-45-67')).toBe(true);
        expect(isValidPhone('+7 913')).toBe(false);
    });
    it('limits only the length of working hours', () => {
        expect(isValidWorkingHours('Круглосуточно')).toBe(true);
        expect(isValidWorkingHours('9'.repeat(201))).toBe(false);
    });
});

describe('dates and periods', () => {
    it.each(['2026-02-28', '2028-02-29'])('accepts %s', d => expect(isValidIsoDate(d)).toBe(true));
    it.each(['2026-02-30', '2026-13-01', '26-01-01', '', '2026-1-1'])('rejects %s', d =>
        expect(isValidIsoDate(d)).toBe(false),
    );
    it('accepts open ends and an ordered period', () => {
        expect(datePeriodError('', '')).toBeNull();
        expect(datePeriodError('2026-01-01', '')).toBeNull();
        expect(datePeriodError('', '2026-01-01')).toBeNull();
        expect(datePeriodError('2026-01-01', '2026-01-01')).toBeNull();
    });
    it('rejects impossible dates and an end before the start', () => {
        expect(datePeriodError('2026-02-30', '')).toBe('invalidFrom');
        expect(datePeriodError('', '2026-02-30')).toBe('invalidTo');
        expect(datePeriodError('2026-02-02', '2026-02-01')).toBe('endBeforeStart');
    });
});

describe('working hours', () => {
    it.each(['09:00–18:00', '00:00–23:59', 'Mon-Fri 9-18'])('accepts %s', v =>
        expect(isValidWorkingHours(v)).toBe(true),
    );
    it.each(['09:00', '09:00–18:6', '25:00–18:00', '09:60–18:00'])('rejects %s', v =>
        expect(isValidWorkingHours(v)).toBe(false),
    );
});

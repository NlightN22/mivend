import { describe, expect, it } from 'vitest';
import { applyWorkingHoursInput } from '../../utils/workingHoursFormat';

describe('applyWorkingHoursInput', () => {
    it.each([
        ['9', '9'],
        ['090', '09:0'],
        ['0900', '09:00'],
        ['09001', '09:00–1'],
        ['09001800', '09:00–18:00'],
        ['0900180099', '09:00–18:00'],
        ['09:00-18:00', '09:00–18:00'],
    ])('masks %s as %s', (raw, masked) => expect(applyWorkingHoursInput(raw)).toBe(masked));

    it('keeps text with letters or a slash as typed', () => {
        expect(applyWorkingHoursInput('24/7')).toBe('24/7');
        expect(applyWorkingHoursInput('Пн-Пт 9-18')).toBe('Пн-Пт 9-18');
    });
});

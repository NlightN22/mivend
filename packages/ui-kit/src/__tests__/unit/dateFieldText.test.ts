import { describe, expect, it } from 'vitest';
import {
    isoToDisplay,
    maskDate,
    parseMaskedDate,
} from '../../components/MvDateField/dateFieldText';

describe('date field text', () => {
    it('masks digits as DD.MM.YYYY and shows an ISO date that way', () => {
        expect(maskDate('1107')).toBe('11.07');
        expect(maskDate('11072026x')).toBe('11.07.2026');
        expect(isoToDisplay('2026-07-11')).toBe('11.07.2026');
        expect(isoToDisplay('')).toBe('');
    });

    it('parses only complete real dates', () => {
        expect(parseMaskedDate('11.07.2026')).toBe('2026-07-11');
        expect(parseMaskedDate('11.07.')).toBeNull();
        expect(parseMaskedDate('30.02.2026')).toBeNull();
    });
});

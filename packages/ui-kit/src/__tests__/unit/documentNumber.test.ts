import { describe, it, expect } from 'vitest';
import { formatDocumentNumber } from '../../utils/documentNumber';

describe('formatDocumentNumber', () => {
    it('inserts a dash after the 3-digit instance code', () => {
        expect(formatDocumentNumber('1000000002')).toBe('100-0000002');
    });

    it('keeps an order-scoped -NN suffix after the inserted dash', () => {
        expect(formatDocumentNumber('1000000002-01')).toBe('100-0000002-01');
    });

    it('leaves an old-format alphanumeric code unchanged', () => {
        expect(formatDocumentNumber('ORD-202610-26F5CE2C')).toBe('ORD-202610-26F5CE2C');
    });

    it('handles null/undefined/empty as an empty string', () => {
        expect(formatDocumentNumber(null)).toBe('');
        expect(formatDocumentNumber(undefined)).toBe('');
        expect(formatDocumentNumber('')).toBe('');
    });
});

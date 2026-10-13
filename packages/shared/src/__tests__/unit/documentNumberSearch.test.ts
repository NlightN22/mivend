import { describe, it, expect } from 'vitest';
import { documentNumberSearchTerm, normalizeDocumentNumber } from '../../documentNumberSearch';

describe('documentNumberSearchTerm', () => {
    it('strips a display dash so the stored digits-only value still matches', () => {
        expect(documentNumberSearchTerm('100-0000002')).toBe('%1000000002%');
    });

    it('keeps a real ProformaInvoice -NN suffix intact — only the leading dash is cosmetic', () => {
        expect(documentNumberSearchTerm('100-0000002-01')).toBe('%1000000002-01%');
    });

    it('accepts the versioned proforma number in display and stored form', () => {
        expect(documentNumberSearchTerm('100-0000303-01-2')).toBe('%1000000303-01-2%');
        expect(documentNumberSearchTerm('1000000303-01-2')).toBe('%1000000303-01-2%');
    });

    it('keeps a partial number whose first group is followed by a short group', () => {
        expect(documentNumberSearchTerm('303-01-1')).toBe('%303-01-1%');
        expect(documentNumberSearchTerm('-01-2')).toBe('%-01-2%');
    });

    it('leaves a plain digits-only search unchanged', () => {
        expect(documentNumberSearchTerm('1000000002')).toBe('%1000000002%');
    });

    it('leaves a search with no leading-3-digit-dash pattern unchanged', () => {
        expect(documentNumberSearchTerm('abc')).toBe('%abc%');
        expect(documentNumberSearchTerm('0000002-01')).toBe('%0000002-01%');
    });
});

describe('normalizeDocumentNumber', () => {
    it('maps the displayed form to the stored one and leaves stored values alone', () => {
        expect(normalizeDocumentNumber('001-2345-01-1')).toBe('0012345-01-1');
        expect(normalizeDocumentNumber('001234-01')).toBe('001234-01');
        expect(normalizeDocumentNumber('1042-01')).toBe('1042-01');
    });
});

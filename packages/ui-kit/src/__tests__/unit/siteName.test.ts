import { describe, it, expect } from 'vitest';
import { readSiteName } from '../../utils/siteName';

const docWith = (content: string | null): Pick<Document, 'querySelector'> => ({
    querySelector: () => (content === null ? null : ({ getAttribute: () => content } as Element)),
});

describe('readSiteName', () => {
    it('returns the meta tag value', () => {
        expect(readSiteName(docWith('Acme Parts'))).toBe('Acme Parts');
    });
    it('falls back to the default when the tag is missing or blank', () => {
        expect(readSiteName(docWith(null))).toBe('Shop');
        expect(readSiteName(docWith('  '))).toBe('Shop');
    });
});

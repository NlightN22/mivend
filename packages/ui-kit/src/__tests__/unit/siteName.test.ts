import { describe, it, expect } from 'vitest';
import { readSiteIconUrl, readSiteName } from '../../utils/siteName';

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

describe('readSiteIconUrl', () => {
    it('returns the icon href', () => {
        expect(readSiteIconUrl(docWith('/brand/icon.ico'))).toBe('/brand/icon.ico');
    });
    it('returns null when the link is missing or blank', () => {
        expect(readSiteIconUrl(docWith(null))).toBeNull();
        expect(readSiteIconUrl(docWith(' '))).toBeNull();
    });
    it('returns null for the default build favicon', () => {
        expect(readSiteIconUrl(docWith('/favicon.svg'))).toBeNull();
    });
});

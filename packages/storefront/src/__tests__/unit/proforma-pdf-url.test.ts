import { describe, expect, it } from 'vitest';
import { proformaPdfUrl } from '../../pages/proforma-invoices/proformaPdfUrl';

describe('proformaPdfUrl', () => {
    it('returns the url of a ready document', () => {
        expect(proformaPdfUrl({ status: 'ready', pdfUrl: '/document-pdf/a' })).toBe(
            '/document-pdf/a',
        );
    });

    it('returns null while the document is not ready or missing', () => {
        expect(proformaPdfUrl({ status: 'generating', pdfUrl: '/document-pdf/a' })).toBeNull();
        expect(proformaPdfUrl({ status: 'ready', pdfUrl: null })).toBeNull();
        expect(proformaPdfUrl(null)).toBeNull();
    });
});

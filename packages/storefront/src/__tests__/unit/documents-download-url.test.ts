import { describe, expect, it } from 'vitest';
import { toDocData, type DocumentSummary } from '../../pages/documents/useDocuments';

const doc = (over: Partial<DocumentSummary>): DocumentSummary =>
    ({
        id: '1',
        type: 'contract',
        number: '100',
        issueDate: '2026-03-05T10:00:00Z',
        amount: null,
        currencyCode: null,
        status: 'ready',
        orderId: null,
        fileUrl: null,
        pdfUrl: '/document-pdf/6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
        ...over,
    }) as DocumentSummary;

describe('documents page download link', () => {
    it('asks the PDF route for an attachment, since the route opens inline by default', () => {
        expect(toDocData(doc({})).downloadUrl).toBe(
            '/document-pdf/6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f?download=1',
        );
    });

    it('keeps an ERP file link as it is and has no link without any file', () => {
        expect(toDocData(doc({ fileUrl: '/erp/file.pdf' })).downloadUrl).toBe('/erp/file.pdf');
        expect(toDocData(doc({ pdfUrl: null })).downloadUrl).toBeNull();
    });
});

import { describe, it, expect } from 'vitest';
import { erpDocumentStatusLabel } from '../../pages/orders/useOrders';

describe('erpDocumentStatusLabel', () => {
    it('maps a known ERP document status to customer wording', () => {
        expect(erpDocumentStatusLabel('НаСогласовании')).toBe('Being approved');
    });

    it('shows nothing for an unknown, empty or missing status', () => {
        expect(erpDocumentStatusLabel('СовершенноНовыйСтатус')).toBeNull();
        expect(erpDocumentStatusLabel('')).toBeNull();
        expect(erpDocumentStatusLabel(null)).toBeNull();
        expect(erpDocumentStatusLabel(undefined)).toBeNull();
    });
});

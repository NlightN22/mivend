import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { SettlementHandler } from '../../handlers/settlement.handler';

const ctx = {} as RequestContext;

function build() {
    const documents = { apply: vi.fn(async () => 'applied') };
    const balances = { apply: vi.fn(async () => 'applied') };
    const types = { apply: vi.fn(async () => 'applied') };
    const handler = new SettlementHandler(documents as never, balances as never, types as never);
    return { handler, documents, balances, types };
}

const entry = {
    organizationErpId: 'org-1',
    counterpartyErpId: 'cnt-1',
    contractErpId: 'ctr-1',
    currency: 'RUB',
    amount: 500,
    dueDate: '2026-01-31T00:00:00.000Z',
};
const document = {
    erpId: 'doc-1',
    version: '2026-01-01T00:00:00.000Z',
    documentType: 'sales-invoice',
    documentTypeLabel: 'Sales invoice',
    number: '100',
    date: '2026-01-01T00:00:00.000Z',
    entries: [entry],
};

describe('SettlementHandler', () => {
    it('applies a document with parsed dates and no order links', async () => {
        const { handler, documents } = build();
        await handler.upsertDocument(ctx, document);
        expect(documents.apply).toHaveBeenCalledWith(ctx, {
            ...document,
            isDeleted: false,
            date: new Date(document.date),
            entries: [{ ...entry, dueDate: new Date(entry.dueDate), orderLinks: [] }],
        });
    });

    it('applies a deleted document without entries', async () => {
        const { handler, documents } = build();
        await handler.upsertDocument(ctx, { ...document, isDeleted: true });
        expect(documents.apply).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ isDeleted: true, entries: [] }),
        );
    });

    it('rejects an unparseable date instead of storing it', async () => {
        const { handler, documents } = build();
        await expect(handler.upsertDocument(ctx, { ...document, date: 'soon' })).rejects.toThrow(
            'invalid date',
        );
        expect(documents.apply).not.toHaveBeenCalled();
    });

    it('applies a balance with an optional opening date', async () => {
        const { handler, balances } = build();
        await handler.upsertBalance(ctx, {
            key: 'bal-1',
            version: '1',
            organizationErpId: 'org-1',
            counterpartyErpId: 'cnt-1',
            contractErpId: 'ctr-1',
            currency: 'RUB',
            openingBalance: 0,
            closingBalance: 700,
        });
        expect(balances.apply).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ key: 'bal-1', isDeleted: false, openingDate: null }),
        );
    });

    it('applies a document type with a default sort order', async () => {
        const { handler, types } = build();
        await handler.upsertDocumentType(ctx, {
            documentType: 'sales-invoice',
            version: '1',
            label: 'Sales invoice',
            category: 'sale',
            customerVisible: true,
        });
        expect(types.apply).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ sortOrder: null, isDeleted: false, category: 'sale' }),
        );
    });
});

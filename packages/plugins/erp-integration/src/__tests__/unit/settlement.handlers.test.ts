import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { SettlementBalanceStreamHandler } from '../../handlers/settlement-balance.handler';
import { SettlementDocumentStreamHandler } from '../../handlers/settlement-document.handler';

const ctx = {} as RequestContext;

const wirePayload = {
    version: '2026-10-01T10:00:00Z',
    documentType: 'Sale',
    documentTypeLabel: 'Sale label',
    number: '15',
    date: '2026-09-30T00:00:00Z',
    entries: [
        {
            organizationId: 'org-1',
            counterpartyId: 'cp-1',
            contractId: 'ct-1',
            currency: 'RUB',
            amount: 3505.7,
            dueDate: '2026-10-30T00:00:00Z',
            orderLinks: [{ orderId: 'o-1', orderUuid: 'u-1', amount: 3505.7 }, { orderId: 'o-2' }],
            someFutureField: 'ignored',
        },
    ],
    someFutureTopLevelField: 1,
};

function documentHandler(result = 'applied'): {
    handler: SettlementDocumentStreamHandler;
    apply: ReturnType<typeof vi.fn>;
} {
    const apply = vi.fn().mockResolvedValue(result);
    return { handler: new SettlementDocumentStreamHandler({ apply } as never), apply };
}

describe('SettlementDocumentStreamHandler', () => {
    it('maps the wire payload and tolerates unknown extra fields', async () => {
        const { handler, apply } = documentHandler();

        const outcome = await handler.apply(ctx, 'doc-1', wirePayload);

        expect(outcome).toEqual({ kind: 'applied' });
        const input = apply.mock.calls[0][1];
        expect(input).toMatchObject({ erpId: 'doc-1', isDeleted: false, number: '15' });
        expect(input.entries[0]).toMatchObject({
            counterpartyErpId: 'cp-1',
            amount: 3505.7,
            dueDate: new Date('2026-10-30T00:00:00Z'),
        });
    });

    it('treats absent optional fields as absent, never as false/zero facts', async () => {
        const { handler, apply } = documentHandler();
        const entry = { ...wirePayload.entries[0], dueDate: undefined };

        await handler.apply(ctx, 'doc-1', { ...wirePayload, entries: [entry] });

        const input = apply.mock.calls[0][1];
        expect(input.isDeleted).toBe(false);
        expect(input.entries[0].dueDate).toBeNull();
        expect(input.entries[0].orderLinks[1]).toEqual({
            orderErpId: 'o-2',
            orderUuid: null,
            amount: 0,
        });
    });

    it('passes a deletion through even though a tombstone carries no entries', async () => {
        const { handler, apply } = documentHandler();

        await handler.apply(ctx, 'doc-1', { version: '2', isDeleted: true });

        expect(apply.mock.calls[0][1]).toMatchObject({ isDeleted: true, entries: [] });
    });

    it('skips a live document without entries or date and says why', async () => {
        const { handler, apply } = documentHandler();

        const outcome = await handler.apply(ctx, 'doc-1', { version: '2', entries: [] });

        expect(outcome.kind).toBe('noop');
        expect(apply).not.toHaveBeenCalled();
    });

    it('skips a document with an entry missing its triple', async () => {
        const { handler, apply } = documentHandler();

        const outcome = await handler.apply(ctx, 'doc-1', {
            ...wirePayload,
            entries: [{ ...wirePayload.entries[0], contractId: '' }],
        });

        expect(outcome.kind).toBe('noop');
        expect(apply).not.toHaveBeenCalled();
    });

    it.each(['stale', 'unknown-deleted'])('reports %s as a noop with a reason', async result => {
        const { handler } = documentHandler(result);

        const outcome = await handler.apply(ctx, 'doc-1', wirePayload);

        expect(outcome).toMatchObject({ kind: 'noop' });
    });
});

describe('SettlementBalanceStreamHandler', () => {
    const payload = {
        version: '2026-10-01T10:00:00Z',
        organizationId: 'org-1',
        counterpartyId: 'cp-1',
        contractId: 'ct-1',
        currency: 'RUB',
        openingDate: '2026-01-01T00:00:00Z',
        openingBalance: 100,
        closingBalance: 40,
    };

    it('passes closing_balance through untouched even when it contradicts the opening', async () => {
        const apply = vi.fn().mockResolvedValue('applied');
        const handler = new SettlementBalanceStreamHandler({ apply } as never);

        const outcome = await handler.apply(ctx, 'org-1:cp-1:ct-1', payload);

        expect(outcome).toEqual({ kind: 'applied' });
        expect(apply.mock.calls[0][1]).toMatchObject({ openingBalance: 100, closingBalance: 40 });
    });

    it('reads absent proto3 doubles as zero', async () => {
        const apply = vi.fn().mockResolvedValue('applied');
        const handler = new SettlementBalanceStreamHandler({ apply } as never);

        await handler.apply(ctx, 'k', {
            ...payload,
            openingBalance: undefined,
            closingBalance: undefined,
        });

        expect(apply.mock.calls[0][1]).toMatchObject({ openingBalance: 0, closingBalance: 0 });
    });

    it('skips a balance missing a triple id', async () => {
        const apply = vi.fn();
        const handler = new SettlementBalanceStreamHandler({ apply } as never);

        const outcome = await handler.apply(ctx, 'k', { ...payload, contractId: '' });

        expect(outcome.kind).toBe('noop');
        expect(apply).not.toHaveBeenCalled();
    });
});

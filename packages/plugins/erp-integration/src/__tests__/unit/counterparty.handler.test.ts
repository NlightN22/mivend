import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CounterpartyStreamHandler } from '../../handlers/counterparty.handler';

describe('CounterpartyStreamHandler', () => {
    const ctx = {} as RequestContext;

    // A deletion tombstone never carries a name — same convention as organization/department.
    // The handler must still forward the update so an already-known counterparty can be
    // deactivated; CounterpartyService.upsertActiveState is what refuses to fabricate a
    // brand-new row from a null name, not this handler.
    it('passes name:null through when the payload has no name (deletion tombstone)', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'cp-1', { isDeleted: true });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            null,
            false,
        );
    });

    it('upserts name + isActive, never fabricating REST-only fields', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: false });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            'Acme Corp',
            false,
        );
    });

    // proto3 JSON encoding omits a scalar field equal to its zero-value — isActive:false is never
    // sent explicitly, only as an absent key (same as every sibling handler).
    it('defaults isActive to false when absent (proto3 omits the false zero-value)', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp' });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            'Acme Corp',
            false,
        );
    });

    it('treats isDeleted:true as inactive even when isActive is true', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            isDeleted: true,
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            'Acme Corp',
            false,
        );
    });

    it('stays active when isDeleted is absent (proto3 omits the false zero-value)', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            'Acme Corp',
            true,
        );
    });

    it('creates a row (issue #104) when no matching Counterparty exists yet', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await expect(
            handler.apply(ctx, 'cp-unknown', { name: 'Not yet synced' }),
        ).resolves.toBeUndefined();
        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-unknown',
            'Not yet synced',
            false,
        );
    });

    // manager_id/manager_ids deliberately ignored — blocked on #109 (no erpId↔Administrator
    // mapping exists yet). Presence of these fields in the payload must not affect the call.
    it('ignores manager_id/manager_ids in the payload (blocked on #109)', async () => {
        const counterpartyService = { upsertActiveState: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            managerId: 'mgr-1',
            managerIds: ['mgr-1', 'mgr-2'],
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            'Acme Corp',
            true,
        );
    });
});

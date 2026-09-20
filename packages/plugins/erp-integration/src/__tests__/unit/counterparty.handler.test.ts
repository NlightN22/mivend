import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CounterpartyStreamHandler } from '../../handlers/counterparty.handler';
import { MissingDependencyError } from '../../types';

function makeHandler(
    upsertActiveState = vi.fn().mockResolvedValue(undefined),
    findAdministratorIdByErpId = vi.fn().mockResolvedValue(null),
): {
    handler: CounterpartyStreamHandler;
    counterpartyService: { upsertActiveState: ReturnType<typeof vi.fn> };
    userEnrichmentService: { findAdministratorIdByErpId: ReturnType<typeof vi.fn> };
} {
    const counterpartyService = { upsertActiveState };
    const userEnrichmentService = { findAdministratorIdByErpId };
    const handler = new CounterpartyStreamHandler(
        counterpartyService as never,
        userEnrichmentService as never,
    );
    return { handler, counterpartyService, userEnrichmentService };
}

describe('CounterpartyStreamHandler', () => {
    const ctx = {} as RequestContext;

    // A deletion tombstone never carries a name — same convention as organization/department.
    // The handler must still forward the update so an already-known counterparty can be
    // deactivated; CounterpartyService.upsertActiveState is what refuses to fabricate a
    // brand-new row from a null name, not this handler.
    it('passes name:null through when the payload has no name (deletion tombstone)', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { isDeleted: true });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(ctx, 'cp-1', {
            name: null,
            isActive: false,
            inn: undefined,
            erpGroupLabel: undefined,
            departmentId: undefined,
            assignedManagerId: undefined,
        });
    });

    it('upserts name + isActive, never fabricating REST-only fields', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: false });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: false,
            inn: undefined,
            erpGroupLabel: undefined,
            departmentId: undefined,
            assignedManagerId: undefined,
        });
    });

    // proto3 JSON encoding omits a scalar field equal to its zero-value — isActive:false is never
    // sent explicitly, only as an absent key (same as every sibling handler).
    it('defaults isActive to false when absent (proto3 omits the false zero-value)', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp' });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            expect.objectContaining({ name: 'Acme Corp', isActive: false }),
        );
    });

    it('treats isDeleted:true as inactive even when isActive is true', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            isDeleted: true,
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            expect.objectContaining({ name: 'Acme Corp', isActive: false }),
        );
    });

    it('stays active when isDeleted is absent (proto3 omits the false zero-value)', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            expect.objectContaining({ name: 'Acme Corp', isActive: true }),
        );
    });

    it('creates a row (issue #104) when no matching Counterparty exists yet', async () => {
        const { handler, counterpartyService } = makeHandler();

        await expect(
            handler.apply(ctx, 'cp-unknown', { name: 'Not yet synced' }),
        ).resolves.toBeUndefined();
        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-unknown',
            expect.objectContaining({ name: 'Not yet synced', isActive: false }),
        );
    });

    // Issue #104 follow-up, verified live against @nlightn22/event-contracts@0.38.0
    // (search-platform#92/#118): inn/erpGroupLabel/departmentId are real fields on this stream
    // today — do not skip them just because an older issue comment claimed they were missing.
    it('passes through inn/erpGroupLabel/departmentId when present', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            inn: '7701234567',
            erpGroupLabel: 'Wholesale',
            departmentId: 'dept-1',
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            inn: '7701234567',
            erpGroupLabel: 'Wholesale',
            departmentId: 'dept-1',
            assignedManagerId: undefined,
        });
    });

    // These are real optional-scalar fields — absence must read as "leave unchanged"
    // (undefined), never fabricated as null just because the key wasn't sent.
    it('passes undefined for inn/erpGroupLabel/departmentId when absent from the payload', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

        const call = counterpartyService.upsertActiveState.mock.calls[0][2];
        expect(call.inn).toBeUndefined();
        expect(call.erpGroupLabel).toBeUndefined();
        expect(call.departmentId).toBeUndefined();
    });

    // An explicit null (1C cleared the field) must be applied, not treated as "leave unchanged".
    it('passes through an explicit null for inn/erpGroupLabel/departmentId', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            inn: null,
            erpGroupLabel: null,
            departmentId: null,
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            inn: null,
            erpGroupLabel: null,
            departmentId: null,
            assignedManagerId: undefined,
        });
    });

    // Issue #109 unblocked this — managerId is now resolved to a Vendure Administrator.id via
    // UserEnrichmentService, not ignored.
    describe('manager_id/manager_ids resolution (issue #109 unblocked)', () => {
        it('resolves managerId to an Administrator.id via UserEnrichmentService', async () => {
            const findAdministratorIdByErpId = vi.fn().mockResolvedValue('admin-1');
            const { handler, counterpartyService, userEnrichmentService } = makeHandler(
                undefined,
                findAdministratorIdByErpId,
            );

            await handler.apply(ctx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                managerId: 'user-erp-1',
            });

            expect(userEnrichmentService.findAdministratorIdByErpId).toHaveBeenCalledWith(
                ctx,
                'user-erp-1',
            );
            expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({ assignedManagerId: 'admin-1' }),
            );
        });

        // search-platform#92's own established fallback: primary manager_id wins; else the
        // first entry of manager_ids.
        it('falls back to the first of managerIds when managerId is absent', async () => {
            const findAdministratorIdByErpId = vi.fn().mockResolvedValue('admin-2');
            const { handler, userEnrichmentService, counterpartyService } = makeHandler(
                undefined,
                findAdministratorIdByErpId,
            );

            await handler.apply(ctx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                managerIds: ['user-erp-2', 'user-erp-3'],
            });

            expect(userEnrichmentService.findAdministratorIdByErpId).toHaveBeenCalledWith(
                ctx,
                'user-erp-2',
            );
            expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({ assignedManagerId: 'admin-2' }),
            );
        });

        // Neither field present (1C has no manager assigned at all) must leave an existing
        // REST/portal-assigned manager untouched — never clear it to null.
        it('leaves assignedManagerId untouched when neither managerId nor managerIds is present', async () => {
            const { handler, counterpartyService, userEnrichmentService } = makeHandler();

            await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

            expect(userEnrichmentService.findAdministratorIdByErpId).not.toHaveBeenCalled();
            const call = counterpartyService.upsertActiveState.mock.calls[0][2];
            expect(call.assignedManagerId).toBeUndefined();
        });

        // Ordinary eventual-consistency race (the manager's own `user` event hasn't arrived yet)
        // — must be retryable via MissingDependencyError, never a silent skip that would
        // permanently drop the manager assignment.
        it('throws MissingDependencyError when the manager erpId has no linked Administrator yet', async () => {
            const findAdministratorIdByErpId = vi.fn().mockResolvedValue(null);
            const { handler, counterpartyService } = makeHandler(
                undefined,
                findAdministratorIdByErpId,
            );

            await expect(
                handler.apply(ctx, 'cp-1', {
                    name: 'Acme Corp',
                    isActive: true,
                    managerId: 'user-erp-unlinked',
                }),
            ).rejects.toThrow(MissingDependencyError);
            expect(counterpartyService.upsertActiveState).not.toHaveBeenCalled();
        });
    });
});

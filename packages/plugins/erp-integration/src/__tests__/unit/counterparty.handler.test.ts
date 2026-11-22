import { passthroughGuard } from './contact-guard';
import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { ManagerLinkResolution } from '@mivend/plugin-access-control';

import { CounterpartyStreamHandler } from '../../handlers/counterparty.handler';

function makeHandler(
    upsertActiveState = vi.fn(
        async (
            c: unknown,
            _erpId: string,
            fields: { name: string | null },
            onFirst?: (c: unknown, cp: unknown) => Promise<void>,
        ) => {
            if (fields.name) await onFirst?.(c, { id: 1 });
            return true;
        },
    ),
    findManagerLink = vi.fn().mockResolvedValue({ found: false } satisfies ManagerLinkResolution),
): {
    handler: CounterpartyStreamHandler;
    counterpartyService: { upsertActiveState: ReturnType<typeof vi.fn> };
    userEnrichmentService: { findManagerLink: ReturnType<typeof vi.fn> };
    persons: { linkWaitingContacts: ReturnType<typeof vi.fn> };
    mirror: { write: ReturnType<typeof vi.fn>; seedContactFromMirror: ReturnType<typeof vi.fn> };
    team: { seedFromErp: ReturnType<typeof vi.fn> };
} {
    const counterpartyService = { upsertActiveState };
    const userEnrichmentService = { findManagerLink };
    const contactPoints = { guarded: passthroughGuard };
    const mirror = {
        write: vi.fn().mockResolvedValue(undefined),
        seedContactFromMirror: vi.fn().mockResolvedValue(undefined),
    };
    const team = { seedFromErp: vi.fn().mockResolvedValue(undefined) };
    const persons = { linkWaitingContacts: vi.fn().mockResolvedValue(undefined) };
    const handler = new CounterpartyStreamHandler(
        counterpartyService as never,
        userEnrichmentService as never,
        {
            assignCounterpartyIfInputsChanged: vi.fn(
                async (_c: unknown, _e: string, write: () => unknown) => write(),
            ),
        } as never,
        contactPoints as never,
        persons as never,
        mirror as never,
        team as never,
    );
    return {
        handler,
        counterpartyService,
        userEnrichmentService,
        persons,
        mirror,
        team,
    };
}

describe('CounterpartyStreamHandler', () => {
    const ctx = {} as RequestContext;

    describe('late contact link', () => {
        it('links contacts that waited for this counterparty, but not on a nameless tombstone', async () => {
            const { handler, persons } = makeHandler();
            await handler.apply(ctx, 'cp-1', { name: 'Acme', isActive: true });
            expect(persons.linkWaitingContacts).toHaveBeenCalledWith(ctx, 'cp-1');
            persons.linkWaitingContacts.mockClear();
            await handler.apply(ctx, 'cp-1', { isDeleted: true });
            expect(persons.linkWaitingContacts).not.toHaveBeenCalled();
        });
    });

    describe('contact fields (moved to the contact-info stream)', () => {
        it('never writes address, phone, e-mail, group label or department, whatever the payload carries', async () => {
            const { handler, counterpartyService, mirror } = makeHandler();
            await handler.apply(ctx, 'cp-1', {
                name: 'Acme',
                legalAddress: 'Legal St 1',
                phone: '+70000000000',
                officialEmail: 'a@example.com',
                erpGroupLabel: 'Wholesale',
                departmentId: 'dept-1',
                contactInfos: [{ type: 'Телефон', presentation: '+7 912' }],
            });
            const fields = counterpartyService.upsertActiveState.mock.calls[0][2];
            for (const key of [
                'legalAddress',
                'factualAddress',
                'phone',
                'officialEmail',
                'erpGroupLabel',
                'departmentId',
            ]) {
                expect(fields).not.toHaveProperty(key);
            }
            const mirrored = mirror.write.mock.calls[0][2];
            for (const key of ['legalAddress', 'phone', 'officialEmail', 'contactInfos']) {
                expect(mirrored[key]).toBeUndefined();
            }
        });

        it('seeds the empty phone and e-mail from the mirror after each named event', async () => {
            const { handler, mirror } = makeHandler();
            await handler.apply(ctx, 'cp-1', { name: 'Acme' });
            expect(mirror.seedContactFromMirror).toHaveBeenCalledWith(ctx, 'cp-1');
        });
    });

    describe('ownership (issue #368)', () => {
        it('writes every named event to the mirror, with exactly what it carried', async () => {
            const { handler, mirror } = makeHandler();
            await handler.apply(ctx, 'cp-1', {
                name: 'Acme',
                inn: '7700000001',
                managerIds: ['user-1', 'user-2'],
            });
            expect(mirror.write).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({
                    name: 'Acme',
                    inn: '7700000001',
                    managerIds: '["user-1","user-2"]',
                }),
            );
        });

        it('does not write a nameless tombstone to the mirror', async () => {
            const { handler, mirror } = makeHandler();
            await handler.apply(ctx, 'cp-1', { isDeleted: true });
            expect(mirror.write).not.toHaveBeenCalled();
        });

        it('seeds the team only when the record is seen for the first time', async () => {
            const existing = vi.fn(async () => true);
            const { handler, team } = makeHandler(existing);
            await handler.apply(ctx, 'cp-1', { name: 'Acme' });
            expect(team.seedFromErp).not.toHaveBeenCalled();
        });

        it('seeds the team from the other linked managers on first arrival', async () => {
            const findManagerLink = vi.fn(async (_c: unknown, erpId: string) => ({
                found: true,
                administratorId:
                    erpId === 'user-1' ? 'admin-1' : erpId === 'user-2' ? 'admin-2' : null,
            }));
            const { handler, team } = makeHandler(undefined, findManagerLink as never);
            await handler.apply(ctx, 'cp-1', {
                name: 'Acme',
                managerId: 'user-1',
                managerIds: ['user-1', 'user-2', 'user-3'],
            });
            expect(team.seedFromErp).toHaveBeenCalledWith(ctx, 1, ['admin-2']);
        });
    });

    // Deletion tombstones carry no name, same as organization/department.
    // Forward it so a known counterparty can be deactivated; upsertActiveState refuses null-name inserts.
    it('passes name:null through when the payload has no name (deletion tombstone)', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { isDeleted: true });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            {
                name: null,
                isActive: false,
                inn: undefined,
                assignedManagerId: undefined,
                managerErpId: undefined,
            },
            expect.any(Function),
        );
    });

    it('upserts name + isActive, never fabricating REST-only fields', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: false });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            {
                name: 'Acme Corp',
                isActive: false,
                inn: undefined,
                assignedManagerId: undefined,
                managerErpId: undefined,
            },
            expect.any(Function),
        );
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
            expect.any(Function),
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
            expect.any(Function),
        );
    });

    it('stays active when isDeleted is absent (proto3 omits the false zero-value)', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            expect.objectContaining({ name: 'Acme Corp', isActive: true }),
            expect.any(Function),
        );
    });

    it('creates a row (issue #104) when no matching Counterparty exists yet', async () => {
        const { handler, counterpartyService } = makeHandler();

        await expect(handler.apply(ctx, 'cp-unknown', { name: 'Not yet synced' })).resolves.toEqual(
            { kind: 'applied' },
        );
        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-unknown',
            expect.objectContaining({ name: 'Not yet synced', isActive: false }),
            expect.any(Function),
        );
    });

    it('passes through inn when present', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            inn: '7701234567',
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            {
                name: 'Acme Corp',
                isActive: true,
                inn: '7701234567',
                assignedManagerId: undefined,
                managerErpId: undefined,
            },
            expect.any(Function),
        );
    });

    // These are real optional-scalar fields — absence must read as "leave unchanged"
    // (undefined), never fabricated as null just because the key wasn't sent.
    it('passes undefined for inn when absent from the payload', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

        const call = counterpartyService.upsertActiveState.mock.calls[0][2];
        expect(call.inn).toBeUndefined();
    });

    // An explicit null (ERP cleared the field) must be applied, not treated as "leave unchanged".
    it('passes through an explicit null for inn', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme Corp',
            isActive: true,
            inn: null,
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            {
                name: 'Acme Corp',
                isActive: true,
                inn: null,
                assignedManagerId: undefined,
                managerErpId: undefined,
            },
            expect.any(Function),
        );
    });

    // findManagerLink has three outcomes: known-but-unlinked must not be retried like never-seen.
    describe('manager_id/manager_ids resolution (issue #109 unblocked, mivend.audit.common fix)', () => {
        it('resolves managerId to an Administrator.id when linked', async () => {
            const findManagerLink = vi
                .fn()
                .mockResolvedValue({ found: true, administratorId: 'admin-1' });
            const { handler, counterpartyService, userEnrichmentService } = makeHandler(
                undefined,
                findManagerLink,
            );

            await handler.apply(ctx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                managerId: 'user-erp-1',
            });

            expect(userEnrichmentService.findManagerLink).toHaveBeenCalledWith(ctx, 'user-erp-1');
            expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({
                    assignedManagerId: 'admin-1',
                    managerErpId: 'user-erp-1',
                }),
                expect.any(Function),
            );
        });

        // upstream#92's own established fallback: primary manager_id wins; else the
        // first entry of manager_ids.
        it('falls back to the first of managerIds when managerId is absent', async () => {
            const findManagerLink = vi
                .fn()
                .mockResolvedValue({ found: true, administratorId: 'admin-2' });
            const { handler, userEnrichmentService, counterpartyService } = makeHandler(
                undefined,
                findManagerLink,
            );

            await handler.apply(ctx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                managerIds: ['user-erp-2', 'user-erp-3'],
            });

            expect(userEnrichmentService.findManagerLink).toHaveBeenCalledWith(ctx, 'user-erp-2');
            expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({
                    assignedManagerId: 'admin-2',
                    managerErpId: 'user-erp-2',
                }),
                expect.any(Function),
            );
        });

        // Neither field present (the ERP has no manager assigned at all) must leave an existing
        // REST/portal-assigned manager untouched — never clear it to null.
        it('leaves assignedManagerId/managerErpId untouched when neither managerId nor managerIds is present', async () => {
            const { handler, counterpartyService, userEnrichmentService } = makeHandler();

            await handler.apply(ctx, 'cp-1', { name: 'Acme Corp', isActive: true });

            expect(userEnrichmentService.findManagerLink).not.toHaveBeenCalled();
            const call = counterpartyService.upsertActiveState.mock.calls[0][2];
            expect(call.assignedManagerId).toBeUndefined();
            expect(call.managerErpId).toBeUndefined();
        });

        // Soft link: an ERP user that never arrived must not hold the counterparty (staging: 4
        // counterparties and the contracts behind them stuck on one missing manager).
        it('saves the counterparty with managerErpId and no manager, with a reasoned outcome, when the manager id is not a known ERP user', async () => {
            const findManagerLink = vi.fn().mockResolvedValue({ found: false });
            const { handler, counterpartyService } = makeHandler(undefined, findManagerLink);

            const outcome = await handler.apply(ctx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                managerId: 'user-erp-unknown',
            });

            expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({
                    assignedManagerId: null,
                    managerErpId: 'user-erp-unknown',
                }),
                expect.any(Function),
            );
            expect(outcome).toEqual({
                kind: 'noop',
                reason: expect.stringContaining(
                    'manager reference user-erp-unknown is not a known ERP user',
                ),
            });
        });

        // A known but unlinked manager erpId must save with no manager, not be retried as a race.
        // AdministratorLinkedListener (plugin-counterparty) backfills managerId once the erpId links.
        it('does not throw, and saves with assignedManagerId:null, when the manager erpId is known but still unlinked', async () => {
            const findManagerLink = vi
                .fn()
                .mockResolvedValue({ found: true, administratorId: null });
            const { handler, counterpartyService } = makeHandler(undefined, findManagerLink);

            await expect(
                handler.apply(ctx, 'cp-1', {
                    name: 'Acme Corp',
                    isActive: true,
                    managerId: 'user-erp-unlinked',
                }),
            ).resolves.toEqual({ kind: 'applied' });
            expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
                ctx,
                'cp-1',
                expect.objectContaining({
                    assignedManagerId: null,
                    managerErpId: 'user-erp-unlinked',
                }),
                expect.any(Function),
            );
        });
    });
});

describe('CounterpartyStreamHandler: ERP reference details', () => {
    const ctx = {} as RequestContext;

    it('forwards the new optional fields as plain ids, without resolving them', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', {
            name: 'Acme',
            isActive: true,
            mainContractId: 'contract-absent-from-stream',
            fullName: 'Acme Full',
            mainBankAccountId: 'bank-1',
            ogrnip: '123',
            kpp: '456',
            okpo: '789',
            legalType: 'LegalEntity',
            regionId: 'region-1',
            legalFormId: 'form-1',
        });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            expect.objectContaining({
                mainContractId: 'contract-absent-from-stream',
                fullName: 'Acme Full',
                mainBankAccountId: 'bank-1',
                ogrnip: '123',
                kpp: '456',
                okpo: '789',
                legalType: 'LegalEntity',
                regionId: 'region-1',
                legalFormId: 'form-1',
            }),
            expect.any(Function),
        );
    });

    it('omitted fields are left undefined so stored values are kept (same as inn/phone)', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme', isActive: true });

        const fields = counterpartyService.upsertActiveState.mock.calls[0][2];
        for (const key of ['mainContractId', 'kpp', 'regionId', 'legalFormId', 'legalType']) {
            expect(key in fields).toBe(false);
        }
    });

    it('an explicit null clears the stored value', async () => {
        const { handler, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'cp-1', { name: 'Acme', isActive: true, kpp: null });

        expect(counterpartyService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'cp-1',
            expect.objectContaining({ kpp: null }),
            expect.any(Function),
        );
    });
});

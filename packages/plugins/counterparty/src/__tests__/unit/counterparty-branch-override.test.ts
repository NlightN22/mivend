import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { CounterpartyBranchOverrideResolver } from '../../counterparty-branch-override.resolver';
import { CounterpartyBranchOverrideService } from '../../counterparty-branch-override.service';

describe('setCounterpartyBranchOverride', () => {
    it('is gated by exactly ManageAccessControl', () => {
        const gate = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            CounterpartyBranchOverrideResolver.prototype.setCounterpartyBranchOverride,
        );
        expect(gate).toEqual([CustomPermission.ManageAccessControl.Permission]);
    });

    it('checks the row scope, writes through the mapping service and records a version entry', async () => {
        const counterparty = { id: 7, branchOverrideId: null };
        const connection = {
            getRepository: () => ({ findOne: vi.fn().mockResolvedValue(counterparty) }),
        } as unknown as TransactionalConnection;
        const mapping = { setCounterpartyOverride: vi.fn() };
        const scope = { kind: 'all' };
        const access = {
            resolveCounterpartyScope: vi.fn().mockResolvedValue(scope),
            assertCounterpartyWritableInScope: vi.fn(),
        };
        const versioning = { recordChange: vi.fn() };
        const service = new CounterpartyBranchOverrideService(
            connection,
            mapping as never,
            access as never,
            versioning as never,
        );
        const ctx = {} as RequestContext;

        await service.setOverride(ctx, 7, '3');

        expect(access.assertCounterpartyWritableInScope).toHaveBeenCalledWith(scope, counterparty);
        expect(mapping.setCounterpartyOverride).toHaveBeenCalledWith(ctx, '7', '3');
        expect(versioning.recordChange).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                entityName: 'Counterparty',
                changedFields: { branchOverrideId: { from: null, to: '3' } },
            }),
        );
    });

    it('does not write when the scope check refuses', async () => {
        const connection = {
            getRepository: () => ({ findOne: vi.fn().mockResolvedValue({ id: 7 }) }),
        } as unknown as TransactionalConnection;
        const mapping = { setCounterpartyOverride: vi.fn() };
        const access = {
            resolveCounterpartyScope: vi.fn(),
            assertCounterpartyWritableInScope: vi.fn(() => {
                throw new Error('forbidden');
            }),
        };
        const service = new CounterpartyBranchOverrideService(
            connection,
            mapping as never,
            access as never,
            { recordChange: vi.fn() } as never,
        );
        await expect(service.setOverride({} as RequestContext, 7, '3')).rejects.toThrow(
            'forbidden',
        );
        expect(mapping.setCounterpartyOverride).not.toHaveBeenCalled();
    });
});

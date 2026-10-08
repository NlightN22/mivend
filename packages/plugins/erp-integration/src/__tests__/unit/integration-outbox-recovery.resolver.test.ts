import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY, UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationOutboxRecoveryResolver } from '../../integration-outbox-recovery.resolver';

describe('IntegrationOutboxRecoveryResolver', () => {
    const prototype = IntegrationOutboxRecoveryResolver.prototype;
    const ctx = {} as RequestContext;

    it.each(['requeueFailedIntegrationOutbox', 'rebuildSkippedIntegrationOutbox'])(
        '%s requires the write permission, not the read-only ManageErpIntegration',
        methodName => {
            const permissions = Reflect.getMetadata(
                PERMISSIONS_METADATA_KEY,
                prototype[methodName as keyof typeof prototype],
            );
            expect(permissions).toEqual([CustomPermission.RecoverIntegrationEvents.Permission]);
        },
    );

    it.each([[[]], [['abc']], [['0']], [['-3']], [['1.5']], [[`${'9'.repeat(30)}`]]])(
        'requeue rejects invalid ids %j',
        async ids => {
            const recovery = { requeueFailed: vi.fn() };
            const resolver = new IntegrationOutboxRecoveryResolver(recovery as never);

            await expect(resolver.requeueFailedIntegrationOutbox({ ids })).rejects.toThrow(
                UserInputError,
            );
            expect(recovery.requeueFailed).not.toHaveBeenCalled();
        },
    );

    it('requeue passes numeric ids to the service', async () => {
        const recovery = { requeueFailed: vi.fn().mockResolvedValue(2) };
        const resolver = new IntegrationOutboxRecoveryResolver(recovery as never);

        expect(await resolver.requeueFailedIntegrationOutbox({ ids: ['4', '7'] })).toBe(2);
        expect(recovery.requeueFailed).toHaveBeenCalledWith([4, 7]);
    });

    it('rebuild rejects an invalid id and maps outcomes to the GraphQL enum', async () => {
        const recovery = { rebuildSkipped: vi.fn().mockResolvedValue('still-skipped') };
        const resolver = new IntegrationOutboxRecoveryResolver(recovery as never);

        await expect(resolver.rebuildSkippedIntegrationOutbox(ctx, { id: 'x' })).rejects.toThrow(
            UserInputError,
        );
        expect(await resolver.rebuildSkippedIntegrationOutbox(ctx, { id: '5' })).toBe(
            'STILL_SKIPPED',
        );
    });
});

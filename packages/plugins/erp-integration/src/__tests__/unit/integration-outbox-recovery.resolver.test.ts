import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY, UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationOutboxRecoveryResolver } from '../../integration-outbox-recovery.resolver';

describe('IntegrationOutboxRecoveryResolver', () => {
    const prototype = IntegrationOutboxRecoveryResolver.prototype;
    const ctx = {} as RequestContext;

    it.each([
        'requeueFailedIntegrationOutbox',
        'rebuildSkippedIntegrationOutbox',
        'replayFailedIntegrationInbox',
    ])('%s requires the write permission, not the read-only ManageErpIntegration', methodName => {
        const permissions = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            prototype[methodName as keyof typeof prototype],
        );
        expect(permissions).toEqual([CustomPermission.RecoverIntegrationEvents.Permission]);
    });

    it.each([[[]], [['abc']], [['0']], [['-3']], [['1.5']], [[`${'9'.repeat(30)}`]]])(
        'requeue rejects invalid ids %j',
        async ids => {
            const recovery = { requeueFailed: vi.fn() };
            const resolver = new IntegrationOutboxRecoveryResolver(recovery as never, {} as never);

            await expect(resolver.requeueFailedIntegrationOutbox({ ids })).rejects.toThrow(
                UserInputError,
            );
            expect(recovery.requeueFailed).not.toHaveBeenCalled();
        },
    );

    it('requeue passes numeric ids to the service', async () => {
        const recovery = { requeueFailed: vi.fn().mockResolvedValue(2) };
        const resolver = new IntegrationOutboxRecoveryResolver(recovery as never, {} as never);

        expect(await resolver.requeueFailedIntegrationOutbox({ ids: ['4', '7'] })).toBe(2);
        expect(recovery.requeueFailed).toHaveBeenCalledWith([4, 7]);
    });

    it('rebuild rejects an invalid id and maps outcomes to the GraphQL enum', async () => {
        const recovery = { rebuildSkipped: vi.fn().mockResolvedValue('still-skipped') };
        const resolver = new IntegrationOutboxRecoveryResolver(recovery as never, {} as never);

        await expect(resolver.rebuildSkippedIntegrationOutbox(ctx, { id: 'x' })).rejects.toThrow(
            UserInputError,
        );
        expect(await resolver.rebuildSkippedIntegrationOutbox(ctx, { id: '5' })).toBe(
            'STILL_SKIPPED',
        );
    });

    it.each([[[]], [['abc']], [Array.from({ length: 101 }, (_, n) => String(n + 1))]])(
        'inbox replay rejects invalid id lists',
        async ids => {
            const inboxReplay = { replayFailed: vi.fn() };
            const resolver = new IntegrationOutboxRecoveryResolver(
                {} as never,
                inboxReplay as never,
            );

            await expect(resolver.replayFailedIntegrationInbox({ ids })).rejects.toThrow(
                UserInputError,
            );
            expect(inboxReplay.replayFailed).not.toHaveBeenCalled();
        },
    );

    it('inbox replay passes numeric ids to the service', async () => {
        const inboxReplay = { replayFailed: vi.fn().mockResolvedValue([]) };
        const resolver = new IntegrationOutboxRecoveryResolver({} as never, inboxReplay as never);

        await resolver.replayFailedIntegrationInbox({ ids: ['3', '9'] });

        expect(inboxReplay.replayFailed).toHaveBeenCalledWith([3, 9]);
    });
});

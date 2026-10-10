import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationInboxEventResolver } from '../../integration-inbox-event.resolver';

// #212: dismissFailedIntegrationInbox is a write action on an inbox row, so it needs
// RecoverIntegrationEvents, the same permission replayFailedIntegrationInbox uses — not the
// read-only ManageAccessControl/ManageErpIntegration the queries on this resolver use.
describe('IntegrationInboxEventResolver.dismissFailedIntegrationInbox', () => {
    it('requires RecoverIntegrationEvents', () => {
        const permissions = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            IntegrationInboxEventResolver.prototype.dismissFailedIntegrationInbox,
        );
        expect(permissions).toEqual([CustomPermission.RecoverIntegrationEvents.Permission]);
    });

    it.each([['0'], ['abc'], ['-3']])('rejects an invalid row id %s', async id => {
        const inboxService = { dismissFailed: vi.fn() };
        const resolver = new IntegrationInboxEventResolver(inboxService as never, {} as never);

        await expect(
            resolver.dismissFailedIntegrationInbox({ id, reason: 'no longer actionable' }),
        ).rejects.toThrow(UserInputError);
        expect(inboxService.dismissFailed).not.toHaveBeenCalled();
    });

    it('requires a non-blank reason', async () => {
        const inboxService = { dismissFailed: vi.fn() };
        const resolver = new IntegrationInboxEventResolver(inboxService as never, {} as never);

        await expect(
            resolver.dismissFailedIntegrationInbox({ id: '5', reason: '   ' }),
        ).rejects.toThrow(UserInputError);
        expect(inboxService.dismissFailed).not.toHaveBeenCalled();
    });

    it('passes the numeric id and reason to the service', async () => {
        const inboxService = { dismissFailed: vi.fn().mockResolvedValue(true) };
        const resolver = new IntegrationInboxEventResolver(inboxService as never, {} as never);

        const result = await resolver.dismissFailedIntegrationInbox({
            id: '5',
            reason: 'undecodable, no entity id',
        });

        expect(result).toBe(true);
        expect(inboxService.dismissFailed).toHaveBeenCalledWith(5, 'undecodable, no entity id');
    });
});

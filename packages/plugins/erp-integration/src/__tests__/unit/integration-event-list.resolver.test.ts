import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationEventListResolver } from '../../integration-event-list.resolver';
import { InvalidListOptionsError } from '../../list-options';

describe('IntegrationEventListResolver', () => {
    const prototype = IntegrationEventListResolver.prototype;

    it.each(['integrationInboxIssues', 'integrationOutboxProblems'])(
        '%s is read-only: ManageErpIntegration, not the recovery permission',
        methodName => {
            const permissions = Reflect.getMetadata(
                PERMISSIONS_METADATA_KEY,
                prototype[methodName as keyof typeof prototype],
            );
            expect(permissions).toEqual([CustomPermission.ManageErpIntegration.Permission]);
        },
    );

    it('turns an invalid filter into a UserInputError instead of a 500', async () => {
        const lists = {
            listInboxIssues: vi
                .fn()
                .mockRejectedValue(new InvalidListOptionsError('Cannot filter on "payload"')),
            listOutboxProblems: vi.fn(),
        };
        const resolver = new IntegrationEventListResolver(lists as never);

        await expect(resolver.integrationInboxIssues({ options: {} })).rejects.toThrow(
            UserInputError,
        );
    });

    it('lets unexpected errors through untouched', async () => {
        const lists = { listOutboxProblems: vi.fn().mockRejectedValue(new Error('db down')) };
        const resolver = new IntegrationEventListResolver(lists as never);

        await expect(resolver.integrationOutboxProblems({})).rejects.toThrow('db down');
    });
});

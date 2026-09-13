import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import {
    NotificationAdminResolver,
    administratorNotificationSubscriptionFilter,
} from '../../notification-admin.resolver';
import type { NotificationReceivedEvent } from '../../types';

// Exercises the two places NotificationAdminResolver decides "does this administrator see this
// broadcast row": the notificationReceived subscription filter and assertOwnNotification (used
// by markNotificationRead/resolveNotification) — issue #87 Part 2 / #42.
describe('administratorNotificationSubscriptionFilter', () => {
    const broadcastPayload: NotificationReceivedEvent = {
        notificationReceived: {
            id: 'n-1',
            recipientType: 'administrator-broadcast',
            recipientId: null,
        },
    };
    const ownPayload: NotificationReceivedEvent = {
        notificationReceived: { id: 'n-2', recipientType: 'administrator', recipientId: 'admin-1' },
    };
    const customerPayload: NotificationReceivedEvent = {
        notificationReceived: { id: 'n-3', recipientType: 'customer', recipientId: 'cust-1' },
    };

    it('delivers a broadcast event to every connected administrator, regardless of id', () => {
        expect(
            administratorNotificationSubscriptionFilter(
                broadcastPayload,
                {},
                {
                    recipientType: 'administrator',
                    recipientId: 'admin-1',
                },
            ),
        ).toBe(true);
        expect(
            administratorNotificationSubscriptionFilter(
                broadcastPayload,
                {},
                {
                    recipientType: 'administrator',
                    recipientId: 'admin-2',
                },
            ),
        ).toBe(true);
    });

    it('delivers an own-addressed event only to the matching administrator', () => {
        expect(
            administratorNotificationSubscriptionFilter(
                ownPayload,
                {},
                {
                    recipientType: 'administrator',
                    recipientId: 'admin-1',
                },
            ),
        ).toBe(true);
        expect(
            administratorNotificationSubscriptionFilter(
                ownPayload,
                {},
                {
                    recipientType: 'administrator',
                    recipientId: 'admin-2',
                },
            ),
        ).toBe(false);
    });

    it('never delivers anything to a non-administrator connection', () => {
        expect(
            administratorNotificationSubscriptionFilter(
                broadcastPayload,
                {},
                {
                    recipientType: 'customer',
                    recipientId: 'cust-1',
                },
            ),
        ).toBe(false);
        expect(administratorNotificationSubscriptionFilter(customerPayload, {}, undefined)).toBe(
            false,
        );
    });
});

describe('NotificationAdminResolver — assertOwnNotification with broadcast rows', () => {
    function makeResolver(
        notification: Record<string, unknown> | null,
        callerRecipientId = 'admin-9',
    ): {
        resolver: NotificationAdminResolver;
        notificationService: {
            findOne: ReturnType<typeof vi.fn>;
            resolve: ReturnType<typeof vi.fn>;
            markRead: ReturnType<typeof vi.fn>;
        };
    } {
        const notificationService = {
            findOne: vi.fn(async () => notification),
            resolve: vi.fn(async () => ({ ...notification, status: 'resolved' })),
            markRead: vi.fn(async () => ({ ...notification, status: 'read' })),
        };
        const recipientService = {
            getCurrentAdministrator: vi.fn(async () => ({
                recipientType: 'administrator' as const,
                recipientId: callerRecipientId,
            })),
        };
        const pubSub = { asyncIterableIterator: vi.fn() };
        const resolver = new NotificationAdminResolver(
            notificationService as never,
            recipientService as never,
            pubSub as never,
        );
        return { resolver, notificationService };
    }

    it('allows any administrator to resolve a broadcast notification', async () => {
        const { resolver, notificationService } = makeResolver({
            id: 'n-3',
            recipientType: 'administrator-broadcast',
            recipientId: null,
        });

        await resolver.resolveNotification({} as RequestContext, {
            id: 'n-3',
            resolution: 'fixed',
        });

        expect(notificationService.resolve).toHaveBeenCalledWith({}, 'n-3', 'fixed');
    });

    it('allows any administrator to mark a broadcast notification read', async () => {
        const { resolver, notificationService } = makeResolver({
            id: 'n-3',
            recipientType: 'administrator-broadcast',
            recipientId: null,
        });

        await resolver.markNotificationRead({} as RequestContext, { id: 'n-3' });

        expect(notificationService.markRead).toHaveBeenCalledWith({}, 'n-3');
    });

    it('rejects a non-owning, non-broadcast notification', async () => {
        const { resolver, notificationService } = makeResolver({
            id: 'n-4',
            recipientType: 'administrator',
            recipientId: 'admin-other',
        });

        await expect(
            resolver.markNotificationRead({} as RequestContext, { id: 'n-4' }),
        ).rejects.toThrow();
        expect(notificationService.markRead).not.toHaveBeenCalled();
    });

    it('still allows the owning administrator to act on their own non-broadcast notification', async () => {
        const { resolver, notificationService } = makeResolver(
            { id: 'n-5', recipientType: 'administrator', recipientId: 'admin-9' },
            'admin-9',
        );

        await resolver.markNotificationRead({} as RequestContext, { id: 'n-5' });

        expect(notificationService.markRead).toHaveBeenCalledWith({}, 'n-5');
    });
});

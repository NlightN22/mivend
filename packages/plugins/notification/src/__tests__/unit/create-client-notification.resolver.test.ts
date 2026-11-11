import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { NotificationAdminResolver } from '../../notification-admin.resolver';
import { NotificationShopResolver } from '../../notification-shop.resolver';

const input = { kind: 'error' as const, title: 'T', message: 'M' };
const ctx = {} as RequestContext;

function setup(recipient: { recipientType: string; recipientId: string } | null): {
    record: ReturnType<typeof vi.fn>;
    admin: NotificationAdminResolver;
    shop: NotificationShopResolver;
} {
    const record = vi.fn(async () => ({ id: 'n-1' }));
    const recipientService = {
        getCurrentAdministrator: vi.fn(async () => recipient),
        getCurrentCustomer: vi.fn(async () => recipient),
    };
    return {
        record,
        admin: new NotificationAdminResolver(
            {} as never,
            recipientService as never,
            { record } as never,
            {} as never,
            {} as never,
        ),
        shop: new NotificationShopResolver(
            {} as never,
            recipientService as never,
            { record } as never,
            {} as never,
        ),
    };
}

describe('createClientNotification resolvers', () => {
    it('store the notification for the authenticated caller, never a client-supplied recipient', async () => {
        const { record, admin, shop } = setup({ recipientType: 'customer', recipientId: '7' });

        await admin.createClientNotification(ctx, { input });
        await shop.createClientNotification(ctx, { input });

        expect(record).toHaveBeenCalledTimes(2);
        expect(record).toHaveBeenCalledWith(
            ctx,
            { recipientType: 'customer', recipientId: '7' },
            input,
        );
    });

    it('refuse a caller who has no recipient identity and store nothing', async () => {
        const { record, admin, shop } = setup(null);

        await expect(admin.createClientNotification(ctx, { input })).rejects.toThrow();
        await expect(shop.createClientNotification(ctx, { input })).rejects.toThrow();
        expect(record).not.toHaveBeenCalled();
    });
});

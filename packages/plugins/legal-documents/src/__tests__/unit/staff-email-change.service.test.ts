import { describe, expect, it, vi } from 'vitest';

import { EmailConfirmationRequestedEvent } from '../../events/email-confirmation-requested.event';
import { StaffEmailChangeService } from '../../staff-email-change.service';

const ctx = {} as never;

interface Options {
    user?: { id: number } | null;
    otherCustomer?: boolean;
    otherUser?: { id: number } | null;
    token?: string | null;
    cleared?: boolean;
}

function setup(o: Options = {}) {
    const user = o.user === undefined ? { id: 9 } : o.user;
    const published: unknown[] = [];
    const customers = { findOne: async () => ({ id: 4, emailAddress: 'Old@Example.com', user }) };
    const users = { getUserByEmailAddress: async () => o.otherUser ?? null };
    const query = {
        where: () => query,
        andWhere: () => query,
        getOne: async () => (o.otherCustomer ? { id: 7 } : null),
    };
    const connection = { getRepository: () => ({ createQueryBuilder: () => query }) };
    const confirmations = {
        requestConfirmation: vi.fn(async () => (o.token === undefined ? 'tok' : o.token)),
        clearPending: vi.fn(async () => o.cleared ?? true),
    };
    const notifier = {
        notify: vi.fn(async () => undefined),
        resolve: vi.fn(async () => undefined),
    };
    const events = { publish: async (e: unknown) => published.push(e) };
    const service = new StaffEmailChangeService(
        customers as never,
        users as never,
        connection as never,
        confirmations as never,
        notifier as never,
        events as never,
    );
    return { service, confirmations, notifier, published };
}

describe('StaffEmailChangeService.classify', () => {
    it('stages a free new address for a customer with a sign-in', async () => {
        expect(await setup().service.classify(ctx, 4, 'New@Example.com')).toBe('staged');
    });

    it('treats the same address, ignoring case and spaces, as unchanged', async () => {
        expect(await setup().service.classify(ctx, 4, ' old@example.com ')).toBe('unchanged');
    });

    it('leaves a clash with another customer or sign-in to core', async () => {
        expect(await setup({ otherCustomer: true }).service.classify(ctx, 4, 'a@b.c')).toBe(
            'apply',
        );
        expect(await setup({ otherUser: { id: 1 } }).service.classify(ctx, 4, 'a@b.c')).toBe(
            'apply',
        );
        expect(await setup({ otherUser: { id: 9 } }).service.classify(ctx, 4, 'a@b.c')).toBe(
            'staged',
        );
    });

    it('applies at once for a customer without a sign-in', async () => {
        expect(await setup({ user: null }).service.classify(ctx, 4, 'a@b.c')).toBe('apply');
    });
});

describe('StaffEmailChangeService.stage and cancel', () => {
    it('stores the pending address, notifies and mails the link to the new address', async () => {
        const t = setup();
        await t.service.stage(ctx, 4, 'New@Example.com');
        expect(t.confirmations.requestConfirmation).toHaveBeenCalledWith(ctx, 4, 'new@example.com');
        expect(t.notifier.notify).toHaveBeenCalledWith(ctx, 4);
        expect(t.published[0]).toBeInstanceOf(EmailConfirmationRequestedEvent);
        expect(t.published[0]).toMatchObject({ emailAddress: 'new@example.com', token: 'tok' });
    });

    it('sends nothing again for an already pending address', async () => {
        const t = setup({ token: null });
        await t.service.stage(ctx, 4, 'new@example.com');
        expect(t.notifier.notify).not.toHaveBeenCalled();
        expect(t.published).toHaveLength(0);
    });

    it('resolves the notification only when a pending address was dropped', async () => {
        const t = setup({ cleared: false });
        await t.service.cancel(ctx, 4);
        expect(t.notifier.resolve).not.toHaveBeenCalled();
        const u = setup();
        await u.service.cancel(ctx, 4);
        expect(u.notifier.resolve).toHaveBeenCalledWith(ctx, 4);
    });
});

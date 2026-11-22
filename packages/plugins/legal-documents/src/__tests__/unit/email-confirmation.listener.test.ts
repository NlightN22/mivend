import { describe, expect, it, vi } from 'vitest';

import { EmailConfirmationListener } from '../../email-confirmation.listener';
import { EmailConfirmationRequestedEvent } from '../../events/email-confirmation-requested.event';

const ctx = {} as never;

interface Harness {
    listener: EmailConfirmationListener;
    published: unknown[];
    confirmations: { requestConfirmation: ReturnType<typeof vi.fn> };
    notifier: { notify: ReturnType<typeof vi.fn> };
}

function setup(token: string | null, user: unknown = { id: 9, verified: true }): Harness {
    const published: unknown[] = [];
    const events = {
        ofType: () => ({ subscribe: () => undefined }),
        publish: async (e: unknown) => published.push(e),
    };
    const customers = { findOne: async () => ({ id: 4, emailAddress: 'N@Example.com', user }) };
    const confirmations = {
        requestConfirmation: vi.fn(async () => token),
        markConfirmed: vi.fn(async () => undefined),
    };
    const notifier = {
        notify: vi.fn(async () => undefined),
        resolve: vi.fn(async () => undefined),
    };
    const listener = new EmailConfirmationListener(
        events as never,
        customers as never,
        confirmations as never,
        notifier as never,
    );
    return { listener, published, confirmations, notifier };
}

describe('EmailConfirmationListener.request', () => {
    it('sends the link and notifies the customer for a changed address', async () => {
        const t = setup('tok');
        await t.listener.request(ctx, 4);
        expect(t.notifier.notify).toHaveBeenCalledWith(ctx, 4);
        expect(t.published[0]).toBeInstanceOf(EmailConfirmationRequestedEvent);
        expect(t.published[0]).toMatchObject({ emailAddress: 'N@Example.com', token: 'tok' });
    });

    it('does nothing for an unchanged or already pending address', async () => {
        const t = setup(null);
        await t.listener.request(ctx, 4);
        expect(t.notifier.notify).not.toHaveBeenCalled();
        expect(t.published).toHaveLength(0);
    });

    it('does nothing for a customer without a user', async () => {
        const t = setup('tok', null);
        await t.listener.request(ctx, 4);
        expect(t.confirmations.requestConfirmation).not.toHaveBeenCalled();
        expect(t.published).toHaveLength(0);
    });
});

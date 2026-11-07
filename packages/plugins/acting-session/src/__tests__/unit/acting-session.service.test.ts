import { describe, expect, it, vi } from 'vitest';

import { ActingSessionService } from '../../acting-session.service';

const target = {
    counterpartyId: 'cp-1',
    customerId: 'cu-1',
    userId: 'u-1',
    tradingPointId: 'tp-1',
};
const binding = {
    administratorId: '7',
    parentSessionId: '10',
    counterpartyId: 'cp-1',
    customerId: 'cu-1',
    tradingPointId: 'tp-1',
};

function setup(
    over: {
        admin?: unknown;
        target?: unknown;
        ended?: number;
        url?: string;
        nameLookupFails?: boolean;
    } = {},
) {
    const save = vi.fn(async (entity: unknown) => entity);
    const connection = {
        getRepository: (_ctx: unknown, entity: { name: string }) =>
            entity.name === 'User'
                ? { findOneOrFail: async () => ({ id: 'u-1' }) }
                : entity.name === 'Administrator'
                  ? {
                        findOne: async () => {
                            if (over.nameLookupFails) throw new Error('db down');
                            return { id: 7, firstName: 'Ivan', lastName: 'Manager' };
                        },
                    }
                  : { save, query: vi.fn().mockResolvedValue([{ id: '1' }]) },
    };
    const cacheDelete = vi.fn();
    const tickets = {
        issue: vi.fn().mockResolvedValue({ ticket: 'tk', expiresAt: new Date(0) }),
        claim: vi.fn().mockResolvedValue(binding),
    };
    const eligibility = {
        resolveForManager: vi.fn().mockResolvedValue(over.target ?? target),
        resolveByIds: vi.fn().mockResolvedValue(over.target ?? target),
    };
    const liveness = { endDeadSession: vi.fn().mockResolvedValue(over.ended ?? 0) };
    const carts = { deleteForSession: vi.fn() };
    const service = new ActingSessionService(
        connection as never,
        { authOptions: { sessionCacheStrategy: { delete: cacheDelete } } } as never,
        {
            findOneByUserId: async () => ('admin' in over ? over.admin : { id: 7 }),
        } as never,
        eligibility as never,
        tickets as never,
        liveness as never,
        carts as never,
        { storefrontPublicUrl: over.url ?? 'https://shop.example', sessionTtlMs: 5000 },
    );
    return { service, save, tickets, eligibility, carts };
}

const managerCtx = { activeUserId: 'mu-1', session: { id: 10 } } as never;

describe('ActingSessionService', () => {
    it('issues a ticket bound to the manager, their session, the counterparty and the point', async () => {
        const { service, tickets } = setup();

        const result = await service.start(managerCtx, 'cp-1', 'tp-1');

        expect(result).toMatchObject({ ticket: 'tk', storefrontUrl: 'https://shop.example' });
        expect(tickets.issue).toHaveBeenCalledWith(managerCtx, binding);
    });

    it('fails before issuing a ticket when the storefront URL is not configured', async () => {
        const { service, tickets } = setup({ url: '' });
        await expect(service.start(managerCtx, 'cp-1', null)).rejects.toThrow(
            'STOREFRONT_PUBLIC_URL',
        );
        expect(tickets.issue).not.toHaveBeenCalled();
    });

    it('refuses to start without an administrator behind the session', async () => {
        const { service, tickets } = setup({ admin: undefined });
        await expect(service.start(managerCtx, 'cp-1', null)).rejects.toThrow();
        expect(tickets.issue).not.toHaveBeenCalled();
    });

    it('exchanges a ticket for a flagged customer session built through the repository, with no cookie involved', async () => {
        const { service, save } = setup();

        const result = await service.exchange({} as never, 'tk');

        const session = save.mock.calls[0][0] as {
            user: { id: string };
            authenticationStrategy: string;
            activeOrder?: unknown;
            customFields: Record<string, string>;
        };
        expect(session.user.id).toBe('u-1');
        expect(session.activeOrder).toBeUndefined();
        expect(session.customFields).toEqual({
            actingAdministratorId: '7',
            actingParentSessionId: '10',
            actingTradingPointId: 'tp-1',
        });
        expect(result).toMatchObject({
            administratorId: '7',
            administratorName: 'Ivan Manager',
            counterpartyId: 'cp-1',
            tradingPointId: 'tp-1',
        });
        expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('fails the exchange when the manager name cannot be read, so the transaction rolls back with the ticket', async () => {
        const { service } = setup({ nameLookupFails: true });
        await expect(service.exchange({} as never, 'tk')).rejects.toThrow('db down');
    });

    it('refuses the exchange when the portal customer changed since the ticket was issued', async () => {
        const { service, save } = setup({ target: { ...target, customerId: 'cu-2' } });
        await expect(service.exchange({} as never, 'tk')).rejects.toThrow(/changed/);
        expect(save).not.toHaveBeenCalled();
    });

    it('refuses the exchange when the manager session is already dead', async () => {
        const { service } = setup({ ended: 1 });
        await expect(service.exchange({} as never, 'tk')).rejects.toThrow();
    });

    it('finishes an acting session and deletes its carts, and ignores an ordinary one', async () => {
        const { service, carts } = setup();
        const cacheCtx = { session: { id: 3, token: 'tok' } } as never;

        expect(await service.finish(cacheCtx)).toBe(true);
        expect(carts.deleteForSession).toHaveBeenCalledWith(cacheCtx, '3');
    });
});

import { describe, expect, it, vi } from 'vitest';

import { ActingEligibilityService } from '../../acting-eligibility.service';

const activeCounterparty = { id: 'cp-1', isActive: true };
const point = { id: 'tp-1', counterpartyId: 'cp-1', isActive: true, customerStatus: 'active' };

function setup(overrides: {
    counterparty?: unknown;
    linkedId?: string | null;
    customer?: unknown;
    point?: unknown;
    scopeError?: Error;
}) {
    const counterparty = 'counterparty' in overrides ? overrides.counterparty : activeCounterparty;
    const connection = { getRepository: () => ({ findOne: async () => counterparty }) };
    const customers = {
        findOne: vi
            .fn()
            .mockResolvedValue(
                'customer' in overrides ? overrides.customer : { id: 'cu-1', user: { id: 'u-1' } },
            ),
    };
    const counterparties = {
        getLinkedCustomerId: async () => ('linkedId' in overrides ? overrides.linkedId : 'cu-1'),
    };
    const tradingPoints = {
        findById: async () => ('point' in overrides ? overrides.point : point),
    };
    const accessScope = {
        assertCounterpartyWritable: vi.fn(async () => {
            if (overrides.scopeError) throw overrides.scopeError;
        }),
    };
    const service = new ActingEligibilityService(
        connection as never,
        customers as never,
        counterparties as never,
        tradingPoints as never,
        accessScope as never,
    );
    return { service, accessScope };
}

const ctx = {} as never;

describe('ActingEligibilityService', () => {
    it('resolves the linked customer user of an active counterparty and a valid point', async () => {
        const { service } = setup({});
        expect(await service.resolveForManager(ctx, 'cp-1', 'tp-1')).toEqual({
            counterpartyId: 'cp-1',
            customerId: 'cu-1',
            userId: 'u-1',
            tradingPointId: 'tp-1',
        });
    });

    it('refuses a counterparty outside the manager scope', async () => {
        const { service } = setup({ scopeError: new Error('scope') });
        await expect(service.resolveForManager(ctx, 'cp-1', null)).rejects.toThrow(
            /not allowed|FORBIDDEN|permission/i,
        );
    });

    it('refuses an ERP-inactive counterparty', async () => {
        const { service } = setup({ counterparty: { id: 'cp-1', isActive: false } });
        await expect(service.resolveForManager(ctx, 'cp-1', null)).rejects.toThrow(/inactive/);
    });

    it('refuses a counterparty without an activated portal or with a deactivated customer', async () => {
        await expect(
            setup({ linkedId: null }).service.resolveForManager(ctx, 'cp-1', null),
        ).rejects.toThrow(/portal access/);
        await expect(
            setup({ customer: undefined }).service.resolveForManager(ctx, 'cp-1', null),
        ).rejects.toThrow(/portal access/);
    });

    it('refuses an unknown counterparty', async () => {
        await expect(
            setup({ counterparty: null }).service.resolveForManager(ctx, 'cp-9', null),
        ).rejects.toThrow(/not found/);
    });

    it('refuses a point of another counterparty or an inactive one', async () => {
        for (const bad of [
            { ...point, counterpartyId: 'cp-2' },
            { ...point, isActive: false },
            { ...point, customerStatus: 'hidden' },
            null,
        ]) {
            await expect(
                setup({ point: bad }).service.resolveForManager(ctx, 'cp-1', 'tp-1'),
            ).rejects.toThrow(/trading point/);
        }
    });

    it('skips the manager scope check on the exchange side, which has no manager context', async () => {
        const { service, accessScope } = setup({});
        await service.resolveByIds(ctx, 'cp-1', null);
        expect(accessScope.assertCounterpartyWritable).not.toHaveBeenCalled();
    });
});

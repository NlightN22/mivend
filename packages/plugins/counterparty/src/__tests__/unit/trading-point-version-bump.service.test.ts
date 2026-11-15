import { TradingPointCustomerService } from '../../trading-point-customer.service';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';
import { TradingPointVersionService } from '../../trading-point-version.service';
import { TradingPointVersionedEvent } from '../../trading-point-versioned.event';
import { TradingPoint } from '../../entities/trading-point.entity';
import { ContactPerson } from '../../entities/contact-person.entity';
import { Counterparty } from '../../entities/counterparty.entity';

const tpRepo = {
    query: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    save: vi.fn(async (record: unknown) => record),
    update: vi.fn(async () => ({ affected: 1 })),
    create: vi.fn((input: unknown) => input),
};
const connection = {
    getRepository: vi.fn((_ctx: unknown, entity: unknown) => {
        if (entity === TradingPoint) return tpRepo;
        if (entity === ContactPerson) return { create: (i: unknown) => i, delete: vi.fn() };
        if (entity === Counterparty) return { findOne: async () => ({ id: 'cp-1' }) };
        return tpRepo;
    }),
};
const bump = vi.fn(async () => 7);
const ctx = {} as unknown as RequestContext;
const point = {
    id: 'tp-1',
    name: 'Point A',
    address: 'Addr',
    workingHours: null,
    deliveryComment: null,
    counterpartyId: 'cp-1',
    contacts: [],
    latitude: 10,
    longitude: 20,
    isActive: true,
    customerStatus: 'active',
    servicingBranchId: null,
};

describe('TradingPointService version bumps', () => {
    let service: TradingPointService;
    let customers: TradingPointCustomerService;

    beforeEach(() => {
        vi.clearAllMocks();
        customers = new TradingPointCustomerService(
            connection as unknown as TransactionalConnection,
            { bump } as never,
        );
        service = new TradingPointService(
            connection as unknown as TransactionalConnection,
            {} as never,
            { assertCounterpartyWritable: vi.fn() } as never,
            { recordChange: vi.fn() } as never,
            {} as never,
            { bump } as never,
        );
        tpRepo.findOne.mockResolvedValue({ ...point });
    });

    it('bumps once for a staff edit that changes the record', async () => {
        await service.updateDetails(ctx, 'tp-1', { name: 'Renamed' });
        expect(bump).toHaveBeenCalledTimes(1);
    });

    it('does not bump for an edit that changes nothing or only the servicing branch', async () => {
        await service.updateDetails(ctx, 'tp-1', { name: 'Point A' });
        await service.updateDetails(ctx, 'tp-1', { servicingBranchId: 'branch-b' });
        expect(bump).not.toHaveBeenCalled();
    });

    it('bumps on a real active toggle only', async () => {
        await service.setActive(ctx, 'tp-1', true);
        expect(bump).not.toHaveBeenCalled();
        await service.setActive(ctx, 'tp-1', false);
        expect(bump).toHaveBeenCalledTimes(1);
    });

    it('bumps when the customer hides a visible point, not when it is already hidden', async () => {
        await customers.customerDelete(ctx, 'tp-1', 'cp-1');
        expect(bump).toHaveBeenCalledTimes(1);
        tpRepo.findOne.mockResolvedValue({ ...point, customerStatus: 'hidden' });
        await customers.customerDelete(ctx, 'tp-1', 'cp-1');
        expect(bump).toHaveBeenCalledTimes(1);
    });

    it('bumps on restore of a hidden point, not of an active one', async () => {
        await customers.customerRestore(ctx, 'tp-1', 'cp-1');
        expect(bump).not.toHaveBeenCalled();
        tpRepo.findOne.mockResolvedValue({ ...point, customerStatus: 'hidden' });
        await customers.customerRestore(ctx, 'tp-1', 'cp-1');
        expect(bump).toHaveBeenCalledTimes(1);
    });

    it('a customer-added point gets its first version', async () => {
        const saved = await customers.customerAdd(ctx, 'cp-1', {
            name: 'New',
            address: 'Some Street 1',
            latitude: 1,
            longitude: 2,
        });
        expect(bump).toHaveBeenCalledTimes(1);
        expect(saved.version).toBe(7);
    });

    it('the staff delivery comment bumps only when the value really changes', async () => {
        await service.updateDeliveryComment(ctx, 'tp-1', null);
        expect(bump).not.toHaveBeenCalled();
        await service.updateDeliveryComment(ctx, 'tp-1', 'Gate 2');
        expect(bump).toHaveBeenCalledTimes(1);
    });

    it('the admin upsert bumps a new point or a real change when announced, never the consumer path', async () => {
        tpRepo.query.mockResolvedValue([{ id: 'cp-1', branchId: null }]);
        tpRepo.findOne.mockResolvedValue(null);
        const payload = {
            erpId: 'e9',
            counterpartyErpId: 'cp-erp',
            name: 'N',
            address: 'A',
            isActive: true,
        };
        await service.upsert(ctx, payload);
        expect(bump).not.toHaveBeenCalled();
        await service.upsert(ctx, payload, { announce: true });
        expect(bump).toHaveBeenCalledTimes(1);
        tpRepo.findOne.mockResolvedValue({ ...point, counterpartyId: 'cp-1', isActive: true });
        await service.upsert(ctx, payload, { announce: true });
        expect(bump).toHaveBeenCalledTimes(1);
    });

    it('inbound stream writes never bump', async () => {
        tpRepo.findOne.mockResolvedValue({ ...point, erpId: 'e1' });
        await service.upsertFromStream(ctx, 'e1', {
            name: 'From ERP',
            counterpartyId: 'cp-1',
            servicingBranchId: null,
            isActive: false,
        });
        await service.deactivate(ctx, 'e1');
        expect(bump).not.toHaveBeenCalled();
    });
});

describe('TradingPointVersionService', () => {
    it('publishes the new version once and fails when the point is missing', async () => {
        const publish = vi.fn();
        const query = vi
            .fn()
            .mockResolvedValueOnce([{ uuid: 'u1', version: 4 }])
            .mockResolvedValueOnce([]);
        const conn = { getRepository: () => ({ query }) } as unknown as TransactionalConnection;
        const service = new TradingPointVersionService(conn, { publish } as never);

        await expect(service.bump(ctx, 'tp-1')).resolves.toBe(4);
        const event = publish.mock.calls[0][0] as TradingPointVersionedEvent;
        expect([event.tradingPointUuid, event.version]).toEqual(['u1', 4]);

        await expect(service.bump(ctx, 'gone')).rejects.toThrow('not found');
        expect(publish).toHaveBeenCalledTimes(1);
    });
});

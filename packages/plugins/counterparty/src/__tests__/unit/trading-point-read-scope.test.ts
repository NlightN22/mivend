import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';
import {
    CounterpartyTradingPointResolver,
    TradingPointAdminResolver,
} from '../../trading-point.resolver';
import { CounterpartyTeamFieldResolver } from '../../counterparty-team.resolver';
import type { CounterpartyTeamService } from '../../counterparty-team.service';
import type { CounterpartyService } from '../../counterparty.service';
import { CounterpartyPortalAccessFieldResolver } from '../../counterparty-portal-access.resolver';
import type { CounterpartyPortalAccessService } from '../../counterparty-portal-access.service';
import { CounterpartyCustomerLinkResolver } from '../../counterparty.resolver';

const findOne = vi.fn();
const rawQuery = vi.fn();
const connection = {
    getRepository: (_ctx: unknown, entity: unknown) =>
        entity === 'Channel' ? { query: rawQuery } : { findOne },
};
const guest = { activeUserId: undefined } as unknown as RequestContext;
const customer = { activeUserId: 5 } as unknown as RequestContext;

describe('TradingPointService.findOwnById (Shop API)', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TradingPointService(
            connection as unknown as TransactionalConnection,
            {} as CustomerService,
            {} as never,
            {} as never,
            {} as never,
        );
    });

    it('returns null for a guest without touching the database', async () => {
        expect(await service.findOwnById(guest, '1')).toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('returns null when the customer has no counterparty', async () => {
        rawQuery.mockResolvedValue([{ cid: null }]);
        expect(await service.findOwnById(customer, '1')).toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the own counterparty and active points', async () => {
        rawQuery.mockResolvedValue([{ cid: 'cp-1' }]);
        findOne.mockResolvedValue({ id: '1' });
        expect(await service.findOwnById(customer, '1')).toEqual({ id: '1' });
        expect(findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: '1', counterpartyId: 'cp-1', isActive: true },
            }),
        );
    });

    it('returns null for another counterparty, an inactive point or an unknown id', async () => {
        rawQuery.mockResolvedValue([{ cid: 'cp-1' }]);
        findOne.mockResolvedValue(null);
        expect(await service.findOwnById(customer, '999')).toBeNull();
    });
});

describe('TradingPointAdminResolver.tradingPoint (Admin API)', () => {
    const findById = vi.fn();
    const findOneVisible = vi.fn();
    const resolveServicingBranchId = vi.fn();
    const resolveCounterpartyScope = vi.fn();
    const resolver = new TradingPointAdminResolver(
        { findById, resolveServicingBranchId } as unknown as TradingPointService,
        { findOneVisible } as unknown as CounterpartyService,
        { resolveCounterpartyScope } as never,
    );

    beforeEach(() => vi.clearAllMocks());

    it('returns the point when its counterparty is in the caller scope', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-1' });
        findOneVisible.mockResolvedValue({ id: 'cp-1' });
        expect(await resolver.tradingPoint(customer, { id: '1' })).toEqual({
            id: '1',
            counterpartyId: 'cp-1',
        });
    });

    it('returns a hidden client point serviced by the caller branch (read-time branch, #263)', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        findOneVisible.mockResolvedValue(null);
        resolveCounterpartyScope.mockResolvedValue({ kind: 'department', branchId: 'b-1' });
        resolveServicingBranchId.mockResolvedValue('b-1');
        expect(await resolver.tradingPoint(customer, { id: '1' })).toEqual({
            id: '1',
            counterpartyId: 'cp-2',
        });
    });

    it('returns null when a hidden client point is serviced by another branch', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        findOneVisible.mockResolvedValue(null);
        resolveCounterpartyScope.mockResolvedValue({ kind: 'department', branchId: 'b-1' });
        resolveServicingBranchId.mockResolvedValue('b-2');
        expect(await resolver.tradingPoint(customer, { id: '1' })).toBeNull();
    });

    it('never widens an own scope or a branchless department scope by branch', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        findOneVisible.mockResolvedValue(null);
        resolveServicingBranchId.mockResolvedValue(null);
        resolveCounterpartyScope.mockResolvedValue({ kind: 'own', administratorId: '5' });
        expect(await resolver.tradingPoint(customer, { id: '1' })).toBeNull();
        resolveCounterpartyScope.mockResolvedValue({ kind: 'department' });
        expect(await resolver.tradingPoint(customer, { id: '1' })).toBeNull();
        expect(resolveServicingBranchId).not.toHaveBeenCalled();
    });

    it('returns null when the counterparty is outside the caller scope', async () => {
        findById.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        findOneVisible.mockResolvedValue(null);
        resolveCounterpartyScope.mockResolvedValue({ kind: 'department', branchId: 'b-1' });
        resolveServicingBranchId.mockResolvedValue('b-2');
        expect(await resolver.tradingPoint(customer, { id: '1' })).toBeNull();
    });

    it('returns null for an unknown id', async () => {
        findById.mockResolvedValue(null);
        expect(await resolver.tradingPoint(customer, { id: '9' })).toBeNull();
        expect(findOneVisible).not.toHaveBeenCalled();
    });
});

describe('TradingPointService.updateDeliveryComment scope', () => {
    const update = vi.fn();
    const assertCounterpartyWritable = vi.fn();
    const repo = { findOne, update };
    const conn = { getRepository: () => repo };
    const service = new TradingPointService(
        conn as unknown as TransactionalConnection,
        {} as CustomerService,
        { assertCounterpartyWritable } as never,
        {} as never,
        {} as never,
    );

    beforeEach(() => vi.clearAllMocks());

    it('does not write when the counterparty is outside the staff scope', async () => {
        findOne.mockResolvedValue({ id: '1', counterpartyId: 'cp-2' });
        assertCounterpartyWritable.mockRejectedValue(new Error('forbidden'));
        await expect(service.updateDeliveryComment(customer, '1', 'x')).rejects.toThrow(
            'forbidden',
        );
        expect(update).not.toHaveBeenCalled();
    });

    it('writes the comment when in scope', async () => {
        findOne.mockResolvedValue({ id: '1', counterpartyId: 'cp-1' });
        assertCounterpartyWritable.mockResolvedValue(undefined);
        await service.updateDeliveryComment(customer, '1', 'x');
        expect(update).toHaveBeenCalledWith({ id: '1' }, { deliveryComment: 'x' });
    });
});

describe('nested fields of a hidden counterparty (Admin API, #263)', () => {
    const findByCounterparty = vi.fn().mockResolvedValue([{ id: '1' }]);
    const getTeamMembers = vi.fn().mockResolvedValue([{ id: 't' }]);
    const findPortalUsers = vi.fn().mockResolvedValue([{ id: 'u' }]);
    const getLinkedCustomerId = vi.fn().mockResolvedValue('7');
    const findOneVisible = vi.fn();
    const counterparties = {
        findOneVisible,
        getLinkedCustomerId,
    } as unknown as CounterpartyService;
    const points = new CounterpartyTradingPointResolver(
        { findByCounterparty } as unknown as TradingPointService,
        counterparties,
    );
    const team = new CounterpartyTeamFieldResolver(
        { getTeamMembers } as unknown as CounterpartyTeamService,
        counterparties,
    );
    const portal = new CounterpartyPortalAccessFieldResolver(
        { findPortalUsers } as unknown as CounterpartyPortalAccessService,
        counterparties,
    );
    const link = new CounterpartyCustomerLinkResolver(counterparties);
    const admin = (): RequestContext => ({ apiType: 'admin' }) as unknown as RequestContext;
    const cp = { id: 'cp-2' } as never;

    beforeEach(() => vi.clearAllMocks());

    it('returns no points, team, portal users or link to a staff member who cannot see it', async () => {
        findOneVisible.mockResolvedValue(null);
        const ctx = admin();
        expect(await points.tradingPoints(ctx, cp)).toEqual([]);
        expect(await team.teamMembers(ctx, cp)).toEqual([]);
        expect(await portal.portalUsers(ctx, cp)).toEqual([]);
        expect(await link.linkedCustomerId(ctx, cp)).toBeNull();
        expect(findByCounterparty).not.toHaveBeenCalled();
        expect(getTeamMembers).not.toHaveBeenCalled();
        expect(findPortalUsers).not.toHaveBeenCalled();
        expect(getLinkedCustomerId).not.toHaveBeenCalled();
        expect(findOneVisible).toHaveBeenCalledTimes(1);
    });

    it('returns them when the counterparty is visible', async () => {
        findOneVisible.mockResolvedValue({ id: 'cp-2' });
        const ctx = admin();
        expect(await points.tradingPoints(ctx, cp)).toEqual([{ id: '1' }]);
        expect(await team.teamMembers(ctx, cp)).toEqual([{ id: 't' }]);
        expect(await portal.portalUsers(ctx, cp)).toEqual([{ id: 'u' }]);
        expect(await link.linkedCustomerId(ctx, cp)).toBe('7');
    });

    it('never gates the Shop API', async () => {
        const shop = { apiType: 'shop' } as unknown as RequestContext;
        expect(await points.tradingPoints(shop, cp)).toEqual([{ id: '1' }]);
        expect(findOneVisible).not.toHaveBeenCalled();
    });
});

import { describe, expect, it, vi } from 'vitest';
import { EntityNotFoundError, Permission } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { toOrderCancelResult } from '../../order-cancel-entry.result';
import { OrderCancelEntryService } from '../../order-cancel-entry.service';
import { AdminCancelOrderResolver, ShopCancelOrderResolver } from '../../order-cancel.resolver';
import type { CancelOutcome } from '../../order-cancellation.service';

const PERMISSIONS_KEY = '__permissions__';

describe('toOrderCancelResult', () => {
    it.each([
        ['shipped', 'SHIPPED'],
        ['in-progress', 'IN_PROGRESS'],
        ['paid', 'PAID'],
        ['refused-by-erp', 'REFUSED_BY_ERP'],
        ['registration-rejected', 'REGISTRATION_REJECTED'],
    ] as const)('maps refusal %s to a typed refused result', (reason, code) => {
        const result = toOrderCancelResult({ kind: 'not-cancellable', reason });
        expect(result).toMatchObject({ __typename: 'OrderCancelRefused', reason: code });
    });

    it.each([
        [{ kind: 'cancelled', eventSent: true }, 'CANCELLED'],
        [{ kind: 'cancel-requested' }, 'CANCEL_REQUESTED'],
        [{ kind: 'already-requested' }, 'CANCEL_REQUESTED'],
        [{ kind: 'already-cancelled' }, 'ALREADY_CANCELLED'],
    ] as Array<[CancelOutcome, string]>)('maps %j to success %s', (outcome, code) => {
        expect(toOrderCancelResult(outcome)).toEqual({
            __typename: 'OrderCancelSuccess',
            outcome: code,
        });
    });
});

describe('OrderCancelEntryService', () => {
    const build = (order: { id: string } | null, customer: { id: string } | undefined) => {
        const findOne = vi.fn(async () => order);
        const cancel = vi.fn(
            async (): Promise<CancelOutcome> => ({
                kind: 'not-cancellable',
                reason: 'in-progress',
            }),
        );
        const getOne = vi.fn(async () => order);
        const qb = { alias: 'order', andWhere: vi.fn(() => ({ getOne })) };
        const service = new OrderCancelEntryService(
            { getRepository: () => ({ findOne }) } as never,
            { findOneByUserId: vi.fn(async () => customer) } as never,
            { buildVisibleOrdersQuery: vi.fn(async () => qb) } as never,
            { cancel } as never,
        );
        return { service, findOne, cancel };
    };
    const ctx = { activeUserId: 'u1' } as unknown as RequestContext;

    it('looks the order up by code AND the active customer, so another customer gets not found', async () => {
        const { service, findOne, cancel } = build(null, { id: 'c1' });
        await expect(service.cancelAsCustomer(ctx, 'A1')).rejects.toBeInstanceOf(
            EntityNotFoundError,
        );
        expect(findOne).toHaveBeenCalledWith({ where: { code: 'A1', customer: { id: 'c1' } } });
        expect(cancel).not.toHaveBeenCalled();
    });

    it('is not found without a customer for the active user', async () => {
        const { service, cancel } = build({ id: '1' }, undefined);
        await expect(service.cancelAsCustomer(ctx, 'A1')).rejects.toBeInstanceOf(
            EntityNotFoundError,
        );
        expect(cancel).not.toHaveBeenCalled();
    });

    it('cancels with the customer reason and returns the refusal as a result', async () => {
        const { service, cancel } = build({ id: '1' }, { id: 'c1' });
        const result = await service.cancelAsCustomer(ctx, 'A1');
        expect(cancel).toHaveBeenCalledWith(ctx, '1', 'customer-request');
        expect(result).toMatchObject({ reason: 'IN_PROGRESS' });
    });

    it('staff cancel is limited to orders visible in scope', async () => {
        const out = build(null, undefined);
        await expect(out.service.cancelAsStaff(ctx, '9')).rejects.toBeInstanceOf(
            EntityNotFoundError,
        );
        const ok = build({ id: '9' }, undefined);
        await ok.service.cancelAsStaff(ctx, '9');
        expect(ok.cancel).toHaveBeenCalledWith(ctx, '9', 'staff-request');
    });
});

describe('cancelOrder permissions', () => {
    it('admin mutation requires CancelOrder, not a generic order permission', () => {
        const perms = Reflect.getMetadata(
            PERMISSIONS_KEY,
            AdminCancelOrderResolver.prototype.cancelOrderAsStaff,
        );
        expect(perms).toEqual(['CancelOrder']);
    });

    it('shop mutation requires the owner permission', () => {
        const perms = Reflect.getMetadata(
            PERMISSIONS_KEY,
            ShopCancelOrderResolver.prototype.cancelOrder,
        );
        expect(perms).toEqual([Permission.Owner]);
    });
});

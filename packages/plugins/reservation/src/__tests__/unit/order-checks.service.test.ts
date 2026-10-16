import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError, PERMISSIONS_METADATA_KEY } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { pickOrderWarehouse } from '../../order-check-subject';
import { OrderCheckSubjectRegistrar } from '../../order-check-subject.registrar';
import { OrderChecksResolver } from '../../order-checks.resolver';
import { OrderChecksService } from '../../order-checks.service';

const ctx = {} as RequestContext;

function service(strongest: string | null | Error) {
    const run = vi.fn(async () => {
        if (strongest instanceof Error) throw strongest;
        return { findings: [], strongestConsequence: strongest };
    });
    const checks = { runChecks: run, findResults: vi.fn(async () => []) };
    const record = vi.fn(async () => undefined);
    const connection = {
        rawConnection: { query: record },
        withTransaction: async (c: unknown, work: (c: unknown) => unknown) => work(c),
        getRepository: () => ({
            query: async () => [],
            count: async () => 0,
            findOne: async () => ({ customFields: { hasCheckFindings: false } }),
            update: vi.fn(),
            createQueryBuilder: () => {
                const qb = {
                    delete: () => qb,
                    where: () => qb,
                    andWhere: () => qb,
                    execute: async () => ({}),
                };
                return qb;
            },
        }),
    };
    const registry = { listForStage: () => [{ code: 'erp.organization-stock' }] };
    const registrar = { visibleIds: async (_c: unknown, ids: string[]) => new Set(ids) };
    return {
        run,
        record,
        orders: new OrderChecksService(
            connection as never,
            checks as never,
            registry as never,
            registrar as never,
        ),
    };
}

describe('OrderChecksService.isHeld', () => {
    it('holds an automatic trigger on a hold consequence at either stage', async () => {
        const { orders, run } = service('hold');
        expect(await orders.isHeld(ctx, '1', 'auto-trust-rule')).toBe(true);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('lets a manual confirmation through a hold: staff is the release', async () => {
        const { orders, run } = service('hold');
        expect(await orders.isHeld(ctx, '1', 'manual')).toBe(false);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it.each(['warn', 'info', null])('never holds on %s', async consequence => {
        const { orders } = service(consequence);
        expect(await orders.isHeld(ctx, '1', 'auto-prepaid')).toBe(false);
    });

    it('does not stop the order flow when a provider fails, and leaves a health record of it', async () => {
        const { orders, record } = service(new Error('boom'));
        expect(await orders.isHeld(ctx, '1', 'auto-trust-rule')).toBe(false);
        await new Promise(r => setImmediate(r));
        expect(record).toHaveBeenCalledWith(expect.stringContaining('order_check_failure'), [
            expect.any(String),
            '1',
            'pre-reserve',
            'boom',
        ]);
    });

    it('stores at most 500 characters of the error text', async () => {
        const { orders, record } = service(new Error('x'.repeat(2000)));
        await orders.isHeld(ctx, '1', 'auto-trust-rule');
        await new Promise(r => setImmediate(r));
        const params = (record.mock.calls[0] as unknown as unknown[])[1] as string[];
        expect(params[3]).toHaveLength(500);
    });

    it('bounds the queue of failure records: extra ones are dropped, not buffered without limit', async () => {
        const { orders, record } = service(new Error('boom'));
        record.mockImplementation(() => new Promise(() => undefined));
        for (let i = 0; i < 150; i += 1)
            orders.recordFailure(String(i), 'pre-reserve', new Error('x'));
        await new Promise(r => setImmediate(r));
        expect(record).toHaveBeenCalledTimes(100);
    });

    it('still continues when recording the failure fails too', async () => {
        const { orders, record } = service(new Error('boom'));
        record.mockRejectedValueOnce(new Error('db down'));
        expect(await orders.isHeld(ctx, '1', 'auto-trust-rule')).toBe(false);
        await new Promise(r => setImmediate(r));
    });
});

describe('order subject helpers and gates', () => {
    it('picks the warehouse with the most quantity, ties by id', () => {
        expect(
            pickOrderWarehouse(
                new Map([
                    ['b', 5],
                    ['a', 5],
                    ['c', 1],
                ]),
            ),
        ).toBe('a');
        expect(
            pickOrderWarehouse(
                new Map([
                    ['a', 1],
                    ['b', 7],
                ]),
            ),
        ).toBe('b');
        expect(pickOrderWarehouse(new Map())).toBeNull();
    });

    it('recomputeOrderChecks needs exactly the check-results permission', () => {
        const gate = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            OrderChecksResolver.prototype.recomputeOrderChecks,
        );
        expect(gate).toEqual([CustomPermission.ReadCheckResults.Permission]);
    });

    it('recomputeOrderChecks denies a read-only role and never reaches the service', async () => {
        const orderChecks = { recompute: vi.fn(async () => []) };
        const resolver = new OrderChecksResolver(orderChecks as never);
        const readOnly = {
            userHasPermissions: (p: string[]) =>
                p[0] === CustomPermission.ReadCheckResults.Permission,
        } as unknown as RequestContext;
        await expect(resolver.recomputeOrderChecks(readOnly, { orderId: '1' })).rejects.toThrow(
            ForbiddenError,
        );
        expect(orderChecks.recompute).not.toHaveBeenCalled();
        const staff = { userHasPermissions: () => true } as unknown as RequestContext;
        await resolver.recomputeOrderChecks(staff, { orderId: '1' });
        expect(orderChecks.recompute).toHaveBeenCalledTimes(1);
    });

    it('registers the order subject with only info, warn and hold', () => {
        const registered: Array<{ allowedConsequences: string[]; stages: string[] }> = [];
        const registrar = new OrderCheckSubjectRegistrar(
            { registerSubjectType: (d: never) => registered.push(d) } as never,
            {} as never,
            {} as never,
        );
        registrar.onModuleInit();
        expect(registered[0].allowedConsequences).toEqual(['info', 'warn', 'hold']);
        expect(registered[0].stages).toEqual([
            'cart',
            'checkout',
            'pre-reserve',
            'pre-send-to-erp',
            'on-edit',
        ]);
    });
});

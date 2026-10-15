import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
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
    const connection = {
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

    it('does not stop the order flow when a provider fails', async () => {
        const { orders } = service(new Error('boom'));
        expect(await orders.isHeld(ctx, '1', 'auto-trust-rule')).toBe(false);
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

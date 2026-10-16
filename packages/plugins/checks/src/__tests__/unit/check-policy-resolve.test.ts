import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CheckPolicyService } from '../../check-policy.service';
import { CheckRegistry } from '../../check-registry';

interface Row {
    branchId: string | null;
    consequence: string;
    enabled: boolean;
}

// Read-only lookup: a fake repository answering findOne by the branch it is asked for.
function service(rows: Row[]): CheckPolicyService {
    const registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'order',
        stages: ['cart', 'on-edit'],
        allowedConsequences: ['info', 'warn', 'hold'],
        stageConsequences: { cart: ['block'] },
        loadSubject: async () => ({}),
        lockKey: id => id,
        visibleSubjectIds: async (_c, ids) => new Set(ids),
    });
    registry.registerCheck({
        code: 'order.multiplicity',
        subjectType: 'order',
        stages: ['cart', 'on-edit'],
        description: 'd',
        stageDefaults: { cart: 'block', 'on-edit': 'warn' },
        defaultEnabled: { cart: false },
        evaluate: () => [],
    });
    const repo = {
        findOne: async ({ where }: { where: { branchId: unknown } }) => {
            const wanted = typeof where.branchId === 'string' ? where.branchId : null;
            return rows.find(r => r.branchId === wanted) ?? null;
        },
    };
    return new CheckPolicyService(
        { getRepository: () => repo } as never,
        registry,
        {} as never,
        {} as never,
    );
}

const ctx = {} as RequestContext;
const resolve = (s: CheckPolicyService, stage: string, branchId: string | null) =>
    s.resolve(ctx, 'order.multiplicity', stage, branchId);

describe('CheckPolicyService.resolve', () => {
    it('falls back to the provider default, which can be off, when no row exists', async () => {
        const s = service([]);
        expect(await resolve(s, 'cart', '1')).toEqual({ consequence: 'block', enabled: false });
        expect(await resolve(s, 'on-edit', null)).toEqual({ consequence: 'warn', enabled: true });
    });

    it('a branch override that disables the global block applies to that branch only', async () => {
        const s = service([
            { branchId: null, consequence: 'block', enabled: true },
            { branchId: '1', consequence: 'block', enabled: false },
        ]);
        expect(await resolve(s, 'cart', '1')).toEqual({ consequence: 'block', enabled: false });
        expect(await resolve(s, 'cart', '2')).toEqual({ consequence: 'block', enabled: true });
        expect(await resolve(s, 'cart', null)).toEqual({ consequence: 'block', enabled: true });
    });

    it('without the override the branch follows the global row again', async () => {
        const s = service([{ branchId: null, consequence: 'block', enabled: true }]);
        expect(await resolve(s, 'cart', '1')).toEqual({ consequence: 'block', enabled: true });
    });

    it('rejects an unregistered check', async () => {
        await expect(service([]).resolve(ctx, 'nope', 'cart', null)).rejects.toThrow(
            /Unknown check/,
        );
    });
});

import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CheckPolicyService } from '../../check-policy.service';
import { CheckRegistry } from '../../check-registry';
import type { CheckPolicy } from '../../entities/check-policy.entity';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    withAggregateLock: async (_c: unknown, ctx: unknown, _k: string, fn: (c: unknown) => unknown) =>
        fn(ctx),
}));

const ctx = {} as RequestContext;

function setup() {
    const registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'manager',
        ephemeral: true,
        stages: ['extend-credit-term'],
        allowedConsequences: ['info', 'warn', 'block'],
        stageConsequences: { 'extend-credit-term': ['require-approval'] },
    });
    registry.registerCheck({
        code: 'manager.credit-term-extension',
        subjectType: 'manager',
        stages: ['extend-credit-term'],
        description: 'd',
        defaultConsequence: 'require-approval',
        evaluate: () => [],
    });
    const global = {
        id: 1,
        branchId: null,
        consequence: 'require-approval',
        enabled: true,
        recipient: 'head',
    };
    const saved: Array<Partial<CheckPolicy>> = [];
    const repo = {
        createQueryBuilder: () => ({
            insert: () => ({
                values: () => ({ orIgnore: () => ({ execute: async () => undefined }) }),
            }),
        }),
        find: async () => [global],
        findOneOrFail: async () => global,
        findOne: async () => null,
        create: (v: object) => ({ id: 2, ...v }),
        save: async (row: Partial<CheckPolicy>) => (saved.push(row), row),
    };
    const connection = {
        getRepository: () => repo,
    };
    const service = new CheckPolicyService(
        connection as never,
        registry,
        { publish: vi.fn() } as never,
        { request: vi.fn() } as never,
    );
    (service as unknown as { assertBranchExists: () => Promise<void> }).assertBranchExists =
        async () => undefined;
    return { service, saved };
}

const input = { checkCode: 'manager.credit-term-extension', stage: 'extend-credit-term' };

describe('CheckPolicyService.update recipient', () => {
    it('a branch override saved without a recipient inherits the global recipient', async () => {
        const { service, saved } = setup();
        await service.update(ctx, {
            ...input,
            branchId: '7',
            consequence: 'require-approval',
            enabled: true,
        });
        expect(saved[0]).toMatchObject({ branchId: '7', recipient: 'head' });
    });

    it('an explicit recipient on a branch override wins', async () => {
        const { service, saved } = setup();
        await service.update(ctx, {
            ...input,
            branchId: '7',
            consequence: 'require-approval',
            recipient: 'dir',
            enabled: true,
        });
        expect(saved[0]).toMatchObject({ recipient: 'dir' });
    });
});

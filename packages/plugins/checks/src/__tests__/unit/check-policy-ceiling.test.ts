import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CheckPolicyService } from '../../check-policy.service';
import { CheckRegistry } from '../../check-registry';

const provider = {
    code: 'order.multiplicity',
    subjectType: 'order',
    stages: ['cart'],
    description: 'd',
    stageDefaults: { cart: 'warn' },
    evaluate: () => [],
};

function service(rowCount: number): CheckPolicyService {
    const registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'order',
        stages: ['cart'],
        allowedConsequences: ['info', 'warn'],
        loadSubject: async () => ({}),
        lockKey: id => id,
        visibleSubjectIds: async (_c, ids) => new Set(ids),
    });
    registry.registerCheck(provider as never);
    const repo = {
        find: async (options: { take: number }) =>
            Array.from({ length: Math.min(rowCount, options.take) }, (_, i) => ({
                checkCode: provider.code,
                branchId: i === 0 ? null : `b-${i}`,
                consequence: 'warn',
                enabled: true,
                recipient: null,
            })),
    };
    return new CheckPolicyService(
        { getRepository: () => repo } as never,
        registry,
        {} as never,
        {} as never,
    );
}

const read = (s: CheckPolicyService) =>
    s.effectiveForStage({} as RequestContext, [provider as never], 'cart', 'b-1');

describe('CheckPolicyService.effectiveForStage ceiling', () => {
    it('passes at two rows per code and fails one over', async () => {
        await expect(read(service(2))).resolves.toBeInstanceOf(Map);
        await expect(read(service(3))).rejects.toMatchObject({
            extensions: { code: 'QUERY_TOO_LARGE' },
        });
    });
});

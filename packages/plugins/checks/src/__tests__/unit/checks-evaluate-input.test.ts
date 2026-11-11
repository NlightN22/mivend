import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CheckRegistry } from '../../check-registry';
import { ChecksService } from '../../checks.service';

const ctx = {} as RequestContext;

function setup() {
    const registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'doc',
        stages: ['placement'],
        allowedConsequences: ['info', 'warn', 'hold'],
        loadSubject: async () => ({}),
        lockKey: id => `doc:${id}`,
        branchId: (s: { branchId: string | null }) => s.branchId,
    });
    const evaluate = vi.fn((_s: unknown, { input }: { input?: unknown }) =>
        input === 'x' ? [{ severity: 'info' as const, facts: {}, messageKey: 'k' }] : [],
    );
    registry.registerCheck({
        code: 'doc.case',
        subjectType: 'doc',
        stages: ['placement'],
        description: 'd',
        evaluate,
    });
    const effectiveForStage = vi.fn(
        async () =>
            new Map([['doc.case', { consequence: 'hold', enabled: true, recipient: null }]]),
    );
    const connection = {
        getRepository: vi.fn(() => {
            throw new Error('must not store');
        }),
    };
    const service = new ChecksService(connection as never, registry, {
        effectiveForStage,
    } as never);
    return { service, evaluate, effectiveForStage };
}

describe('ChecksService.evaluateWithInput', () => {
    it('hands the caller input to the providers and applies the branch policy, storing nothing', async () => {
        const { service, effectiveForStage } = setup();
        const result = await service.evaluateWithInput(
            ctx,
            'doc',
            { branchId: 'b1' },
            'placement',
            'x',
        );
        expect(result.strongestConsequence).toBe('hold');
        expect(effectiveForStage).toHaveBeenCalledWith(ctx, expect.anything(), 'placement', 'b1');
    });

    it('gives no consequence when the input does not match', async () => {
        const { service } = setup();
        const result = await service.evaluateWithInput(
            ctx,
            'doc',
            { branchId: null },
            'placement',
            'y',
        );
        expect(result).toEqual({ findings: [], strongestConsequence: null });
    });
});

import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CheckRegistry } from '../../check-registry';
import { ChecksService } from '../../checks.service';
import { ManagerSubjectRegistrar } from '../../manager-subject.registrar';
import type { Consequence } from '../../types';

const ctx = {} as RequestContext;

function setup(policy: { consequence: Consequence; enabled: boolean; recipient?: string | null }) {
    const registry = new CheckRegistry();
    new ManagerSubjectRegistrar(registry).onModuleInit();
    const evaluate = vi.fn(async () => [
        { severity: 'warning' as const, facts: {}, messageKey: 'k' },
    ]);
    registry.registerCheck({
        code: 'manager.test',
        subjectType: 'manager',
        stages: ['adjust-price'],
        description: 'd',
        defaultConsequence: 'require-approval',
        evaluate,
    });
    const effectiveForStage = vi.fn(
        async () => new Map([['manager.test', { recipient: null, ...policy }]]),
    );
    const connection = {
        getRepository: vi.fn(() => {
            throw new Error('an ephemeral run must not touch result rows');
        }),
    };
    const service = new ChecksService(connection as never, registry, {
        effectiveForStage,
    } as never);
    return { service, evaluate, effectiveForStage, connection };
}

const subject = { roleCodes: [], branchId: 'b1', params: {} };

describe('ChecksService.evaluate (ephemeral subject)', () => {
    it('returns the findings with the policy consequence, stores nothing and takes no lock', async () => {
        const { service, connection, effectiveForStage } = setup({
            consequence: 'require-approval',
            enabled: true,
        });
        const result = await service.evaluate(ctx, 'manager', subject, 'adjust-price');
        expect(result.strongestConsequence).toBe('require-approval');
        expect(result.findings[0]).toMatchObject({
            checkCode: 'manager.test',
            consequence: 'require-approval',
        });
        expect(connection.getRepository).not.toHaveBeenCalled();
        expect(effectiveForStage).toHaveBeenCalledWith(
            ctx,
            expect.anything(),
            'adjust-price',
            'b1',
        );
    });

    it('follows a changed policy with no code change', async () => {
        const warn = await setup({ consequence: 'warn', enabled: true }).service.evaluate(
            ctx,
            'manager',
            subject,
            'adjust-price',
        );
        expect(warn.strongestConsequence).toBe('warn');
    });

    it('skips a disabled check: no finding, no consequence', async () => {
        const { service, evaluate } = setup({ consequence: 'block', enabled: false });
        const result = await service.evaluate(ctx, 'manager', subject, 'adjust-price');
        expect(result).toEqual({ findings: [], strongestConsequence: null });
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('hands the policy recipient to the provider', async () => {
        const { service, evaluate } = setup({
            consequence: 'warn',
            enabled: true,
            recipient: 'approver',
        });
        await service.evaluate(ctx, 'manager', subject, 'adjust-price');
        expect(evaluate).toHaveBeenCalledWith(
            subject,
            expect.objectContaining({ stage: 'adjust-price', recipient: 'approver' }),
        );
    });

    it('rethrows a failing provider instead of reading as no findings', async () => {
        const { service, evaluate } = setup({ consequence: 'warn', enabled: true });
        evaluate.mockRejectedValue(new Error('boom'));
        await expect(service.evaluate(ctx, 'manager', subject, 'adjust-price')).rejects.toThrow(
            'boom',
        );
    });

    it('refuses a stage unknown to the subject type', async () => {
        const { service } = setup({ consequence: 'warn', enabled: true });
        await expect(service.evaluate(ctx, 'manager', subject, 'nope')).rejects.toThrow(
            /not defined/,
        );
    });

    it('is the only path for an ephemeral type: runChecks and markStale refuse it', async () => {
        const { service } = setup({ consequence: 'warn', enabled: true });
        await expect(service.runChecks(ctx, 'manager', 'x', 'adjust-price')).rejects.toThrow(
            /ephemeral/,
        );
        await expect(service.markStale(ctx, 'manager', 'x')).rejects.toThrow(/stores no results/);
    });
});

describe('manager subject type', () => {
    it('allows require-approval only at the stages with an approval executor, block everywhere', () => {
        const registry = new CheckRegistry();
        new ManagerSubjectRegistrar(registry).onModuleInit();
        const def = registry.getSubjectType('manager');
        const allowed = (stage: string) => registry.allowedConsequences(def, stage);
        expect(allowed('extend-reservation')).toEqual(['info', 'warn', 'block']);
        expect(allowed('extend-credit-term')).toContain('require-approval');
        expect(allowed('adjust-price')).toContain('require-approval');
        expect(def.ephemeral).toBe(true);
    });
});

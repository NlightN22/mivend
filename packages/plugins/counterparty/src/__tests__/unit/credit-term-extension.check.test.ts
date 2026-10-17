import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { CreditTermLimitService } from '@mivend/plugin-access-control';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';

import { CreditTermExtensionCheck } from '../../credit-term-extension.check';

const ctx = {} as RequestContext;

function setup(limit: { maxExtraDays: number; maxAmount: number | null } | null) {
    const getLimit = vi.fn(async () => limit);
    const check = new CreditTermExtensionCheck(new CheckRegistry(), {
        getLimit,
    } as unknown as CreditTermLimitService);
    const run = (days: number, amount: number | null, recipient: string | null = 'approver') =>
        check.evaluate(
            {
                roleCodes: ['r'],
                branchId: null,
                params: { requestedExtraDays: days, requestedAmount: amount },
            },
            { ctx, stage: 'extend-credit-term', recipient },
        );
    return { run, getLimit };
}

describe('CreditTermExtensionCheck', () => {
    it('passes at exactly the limit in days', async () => {
        expect(await setup({ maxExtraDays: 14, maxAmount: null }).run(14, null)).toEqual([]);
    });

    it('flags one day beyond the limit', async () => {
        const [finding] = await setup({ maxExtraDays: 14, maxAmount: null }).run(15, null);
        expect(finding.facts).toMatchObject({ reason: 'days', requestedExtraDays: 15 });
    });

    it('flags an amount above the limit when the days are fine', async () => {
        const [finding] = await setup({ maxExtraDays: 14, maxAmount: 500 }).run(7, 600);
        expect(finding.facts).toMatchObject({ reason: 'amount' });
    });

    it('passes when days and amount are within their limits', async () => {
        expect(await setup({ maxExtraDays: 14, maxAmount: 500 }).run(7, 400)).toEqual([]);
    });

    it('does not judge the amount when the request carries none or the limit has none', async () => {
        expect(await setup({ maxExtraDays: 14, maxAmount: 500 }).run(7, null)).toEqual([]);
        expect(await setup({ maxExtraDays: 14, maxAmount: null }).run(7, 10 ** 9)).toEqual([]);
    });

    it('flags a missing limit row as over the limit, never unlimited', async () => {
        const [finding] = await setup(null).run(1, null);
        expect(finding.facts).toMatchObject({ reason: 'no-limit' });
    });

    it('reads the limit of the policy recipient and flags a policy without one', async () => {
        const { run, getLimit } = setup({ maxExtraDays: 14, maxAmount: null });
        await run(1, null, 'approver');
        expect(getLimit).toHaveBeenCalledWith(ctx, 'approver');
        getLimit.mockClear();
        const [finding] = await run(1, null, null);
        expect(getLimit).not.toHaveBeenCalled();
        expect(finding.facts).toMatchObject({ reason: 'no-limit' });
    });
});

describe('CreditTermExtensionCheck default policy', () => {
    it('lazily resolves to require-approval at extend-credit-term', () => {
        const registry = new CheckRegistry();
        registry.registerSubjectType({
            type: MANAGER_SUBJECT_TYPE,
            ephemeral: true,
            stages: [
                MANAGER_STAGES.extendReservation,
                MANAGER_STAGES.extendCreditTerm,
                MANAGER_STAGES.adjustPrice,
            ],
            allowedConsequences: ['info', 'warn', 'block'],
            stageConsequences: {
                [MANAGER_STAGES.extendCreditTerm]: ['require-approval'],
                [MANAGER_STAGES.adjustPrice]: ['require-approval'],
            },
        });
        new CreditTermExtensionCheck(registry, {} as never).onModuleInit();
        const provider = registry.getCheck('manager.credit-term-extension');
        expect(registry.defaultConsequence(provider!, 'extend-credit-term')).toBe(
            'require-approval',
        );
        expect(registry.defaultEnabled(provider!, 'extend-credit-term')).toBe(true);
    });
});

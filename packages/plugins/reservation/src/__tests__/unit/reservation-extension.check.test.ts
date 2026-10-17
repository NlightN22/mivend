import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';

import { ReservationExtensionCheck } from '../../reservation-extension.check';
import type { ReservationExtensionLimitService } from '../../reservation-extension-limit.service';

const ctx = {} as RequestContext;

function run(limit: { maxExtraDays: number } | null, days: number, roleCodes: string[] = ['r']) {
    const getMaxLimit = vi.fn(async () => limit);
    const check = new ReservationExtensionCheck(new CheckRegistry(), {
        getMaxLimit,
    } as unknown as ReservationExtensionLimitService);
    const findings = check.evaluate(
        { roleCodes, branchId: null, params: { additionalDays: days } },
        { ctx, stage: 'extend-reservation', recipient: null },
    );
    return { findings, getLimit: getMaxLimit };
}

describe('ReservationExtensionCheck', () => {
    it('passes within and exactly at the role limit', async () => {
        expect(await run({ maxExtraDays: 3 }, 3).findings).toEqual([]);
        expect(await run({ maxExtraDays: 3 }, 1).findings).toEqual([]);
    });

    it('flags days beyond the role limit', async () => {
        const [finding] = await run({ maxExtraDays: 3 }, 4).findings;
        expect(finding.messageKey).toBe('manager.reservation-extension-days.over-limit');
        expect(finding.facts).toEqual({ requestedDays: 4, limitDays: 3 });
    });

    it('flags a role without a limit row (fail closed), and an actor without a role', async () => {
        const [noRow] = await run(null, 1).findings;
        expect(noRow.messageKey).toBe('manager.reservation-extension-days.no-limit');
        const noRole = run({ maxExtraDays: 9 }, 1, []);
        expect((await noRole.findings)[0].messageKey).toBe(
            'manager.reservation-extension-days.no-limit',
        );
        expect(noRole.getLimit).toHaveBeenCalledWith(ctx, []);
    });

    it('does not judge a request without a usable day count', async () => {
        expect(await run(null, Number.NaN).findings).toEqual([]);
    });
});

describe('ReservationExtensionCheck default policy', () => {
    it('lazily resolves to block at extend-reservation', () => {
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
        new ReservationExtensionCheck(registry, {} as never).onModuleInit();
        const provider = registry.getCheck('manager.reservation-extension-days');
        expect(registry.defaultConsequence(provider!, 'extend-reservation')).toBe('block');
        expect(registry.defaultEnabled(provider!, 'extend-reservation')).toBe(true);
    });
});

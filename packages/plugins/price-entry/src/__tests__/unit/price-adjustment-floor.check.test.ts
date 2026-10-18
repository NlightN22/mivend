import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';

import { PriceAdjustmentFloorCheck } from '../../price-adjustment-floor.check';
import type { FloorPriceService } from '../../floor-price.service';

const ctx = {} as RequestContext;

function run(floor: number | null, requestedPrice: number) {
    const check = new PriceAdjustmentFloorCheck(new CheckRegistry(), {
        forVariants: vi.fn(async () => (floor === null ? new Map() : new Map([['v1', floor]]))),
    } as unknown as FloorPriceService);
    return check.evaluate(
        { roleCodes: [], branchId: null, params: { variantId: 'v1', requestedPrice } },
        { ctx, stage: 'adjust-price', recipient: null },
    );
}

describe('PriceAdjustmentFloorCheck', () => {
    it('passes at the floor price and above', async () => {
        expect(await run(100, 100)).toEqual([]);
        expect(await run(100, 150)).toEqual([]);
    });

    it('flags a price below the floor without revealing the floor', async () => {
        const findings = await run(100, 99);
        expect(findings).toHaveLength(1);
        expect(findings[0].facts).toEqual({ variantId: 'v1', reason: 'below-floor' });
        expect(JSON.stringify(findings)).not.toContain('100');
    });

    it('flags a variant with no floor price (approval, never unlimited discounting)', async () => {
        const [finding] = await run(null, 1);
        expect(finding.facts).toMatchObject({ reason: 'no-floor' });
    });
});

describe('PriceAdjustmentFloorCheck default policy', () => {
    it('lazily resolves to require-approval at adjust-price', () => {
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
        new PriceAdjustmentFloorCheck(registry, {} as never).onModuleInit();
        const provider = registry.getCheck('manager.price-adjustment-floor');
        expect(registry.defaultConsequence(provider!, 'adjust-price')).toBe('require-approval');
        expect(registry.defaultEnabled(provider!, 'adjust-price')).toBe(true);
    });
});

import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';

import { PriceAdjustmentFloorCheck } from '../../price-adjustment-floor.check';
import type { PriceEntryService } from '../../price-entry.service';

const ctx = {} as RequestContext;

function run(floor: number | null, requestedPrice: number) {
    const check = new PriceAdjustmentFloorCheck(new CheckRegistry(), {
        getForVariant: vi.fn(async () => floor),
    } as unknown as PriceEntryService);
    return check.evaluate(
        { roleCode: null, branchId: null, params: { variantId: 'v1', requestedPrice } },
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

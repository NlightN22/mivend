import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceAdjustmentGateService } from '../../price-adjustment-gate.service';
import { PriceEntryService } from '../../price-entry.service';

describe('PriceAdjustmentGateService', () => {
    let priceEntryService: { getForVariant: ReturnType<typeof vi.fn> };
    let gate: PriceAdjustmentGateService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        priceEntryService = { getForVariant: vi.fn() };
        gate = new PriceAdjustmentGateService(priceEntryService as unknown as PriceEntryService);
    });

    // Threshold boundary — the exact case docs/access-control.md calls out as the most
    // likely off-by-one bug in an approval gate.
    it('applies directly when the requested price is exactly at the floor', async () => {
        priceEntryService.getForVariant.mockResolvedValue(10000);
        expect(await gate.evaluate(ctx, 'variant-1', 10000)).toBe('apply-directly');
    });

    it('requires approval when the requested price is one unit below the floor', async () => {
        priceEntryService.getForVariant.mockResolvedValue(10000);
        expect(await gate.evaluate(ctx, 'variant-1', 9999)).toBe('requires-approval');
    });

    it('applies directly when the requested price is above the floor', async () => {
        priceEntryService.getForVariant.mockResolvedValue(10000);
        expect(await gate.evaluate(ctx, 'variant-1', 15000)).toBe('apply-directly');
    });

    it('requires approval when no floor price is configured for the variant, never allows unlimited discounting', async () => {
        priceEntryService.getForVariant.mockResolvedValue(null);
        expect(await gate.evaluate(ctx, 'variant-1', 1)).toBe('requires-approval');
    });

    // The gate's evaluation must never leak the protected threshold value to the caller —
    // its return type is a plain decision string, structurally incapable of carrying the
    // floor price. Assert this holds even for the boundary/no-floor cases above by checking
    // the actual return values contain no trace of the mocked floor value (10000).
    it('never returns the floor price value itself under any evaluated path', async () => {
        priceEntryService.getForVariant.mockResolvedValue(10000);
        const results = await Promise.all([
            gate.evaluate(ctx, 'variant-1', 10000),
            gate.evaluate(ctx, 'variant-1', 9999),
            gate.evaluate(ctx, 'variant-1', 0),
        ]);
        for (const result of results) {
            expect(result).toMatch(/^(apply-directly|requires-approval)$/);
            expect(String(result)).not.toContain('10000');
        }
    });
});

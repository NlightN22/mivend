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

    // Gate returns a plain decision string, so it structurally cannot leak the protected floor price.
    // Tests check the actual return values, not just types, for the mocked floor (10000), including boundary cases.
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

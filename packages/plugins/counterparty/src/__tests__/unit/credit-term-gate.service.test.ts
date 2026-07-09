import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { CreditTermLimitService } from '@mivend/plugin-access-control';

import { CreditTermGateService } from '../../credit-term-gate.service';

describe('CreditTermGateService', () => {
    let creditTermLimitService: { getLimit: ReturnType<typeof vi.fn> };
    let gate: CreditTermGateService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        creditTermLimitService = { getLimit: vi.fn() };
        gate = new CreditTermGateService(
            creditTermLimitService as unknown as CreditTermLimitService,
        );
    });

    it('is within limit when the requested extension is exactly at the configured maxExtraDays', async () => {
        creditTermLimitService.getLimit.mockResolvedValue({ maxExtraDays: 14, maxAmount: null });
        expect(await gate.evaluate(ctx, 14, null)).toBe('within-limit');
    });

    it('exceeds limit when the requested extension is one day beyond maxExtraDays', async () => {
        creditTermLimitService.getLimit.mockResolvedValue({ maxExtraDays: 14, maxAmount: null });
        expect(await gate.evaluate(ctx, 15, null)).toBe('exceeds-limit');
    });

    it('exceeds limit when days are fine but the requested amount is above maxAmount', async () => {
        creditTermLimitService.getLimit.mockResolvedValue({ maxExtraDays: 14, maxAmount: 500000 });
        expect(await gate.evaluate(ctx, 7, 600000)).toBe('exceeds-limit');
    });

    it('is within limit when both days and amount are within their configured maxima', async () => {
        creditTermLimitService.getLimit.mockResolvedValue({ maxExtraDays: 14, maxAmount: 500000 });
        expect(await gate.evaluate(ctx, 7, 400000)).toBe('within-limit');
    });

    it('exceeds limit when no CreditTermLimit is configured, never silently unlimited', async () => {
        creditTermLimitService.getLimit.mockResolvedValue(null);
        expect(await gate.evaluate(ctx, 1, null)).toBe('exceeds-limit');
    });
});

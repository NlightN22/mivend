import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { TaxCategoryAutoCreateService } from '../../tax-category-auto-create.service';

function makeService(overrides?: {
    existingCategory?: { id: string } | null;
    defaultVatCode?: string;
}): {
    service: TaxCategoryAutoCreateService;
    taxCategoryService: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    taxRateService: { create: ReturnType<typeof vi.fn> };
    taxZoneService: { findOrCreateDefaultZone: ReturnType<typeof vi.fn> };
    findOne: ReturnType<typeof vi.fn>;
} {
    const findOne = vi.fn().mockResolvedValue(overrides?.existingCategory ?? null);
    const connection = { getRepository: vi.fn().mockReturnValue({ findOne }) };
    const taxCategoryService = {
        create: vi.fn().mockResolvedValue({ id: 'tax-new' }),
        update: vi.fn(async (_ctx: unknown, input: { id: string }) => ({ ...input })),
    };
    const taxRateService = { create: vi.fn().mockResolvedValue({ id: 'rate-new' }) };
    const taxZoneService = {
        findOrCreateDefaultZone: vi.fn().mockResolvedValue({ id: 'zone-1', name: 'Russia' }),
    };

    const service = new TaxCategoryAutoCreateService(
        connection as never,
        taxCategoryService as never,
        taxRateService as never,
        taxZoneService as never,
        { instanceType: 'central', defaultVatCode: overrides?.defaultVatCode } as never,
    );
    return { service, taxCategoryService, taxRateService, taxZoneService, findOne };
}

describe('TaxCategoryAutoCreateService', () => {
    const ctx = {} as RequestContext;

    it('returns the existing TaxCategory without creating anything when already present', async () => {
        const { service, taxCategoryService, taxRateService } = makeService({
            existingCategory: { id: 'tax-existing' },
        });

        const result = await service.findOrCreate(ctx, 'NDS20', 'НДС20');

        expect(result).toEqual({ id: 'tax-existing' });
        expect(taxCategoryService.create).not.toHaveBeenCalled();
        expect(taxRateService.create).not.toHaveBeenCalled();
    });

    it('creates a TaxCategory and a placeholder 0% TaxRate on the default zone when missing', async () => {
        const { service, taxCategoryService, taxRateService, taxZoneService } = makeService();

        const result = await service.findOrCreate(ctx, 'NDS20', 'НДС20');

        expect(result).toEqual({ id: 'tax-new' });
        expect(taxCategoryService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ customFields: { erpVatCode: 'NDS20' } }),
        );
        expect(taxZoneService.findOrCreateDefaultZone).toHaveBeenCalledWith(ctx);
        expect(taxRateService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ value: 0, categoryId: 'tax-new', zoneId: 'zone-1' }),
        );
    });

    // #144: VatRateChanged has no default flag — the configured code becomes the default.
    describe('ensureDefault', () => {
        it("finds-or-creates the configured code's TaxCategory and marks it default", async () => {
            const { service, taxCategoryService, findOne } = makeService({
                existingCategory: { id: 'tax-nds20' },
                defaultVatCode: 'НДС20',
            });

            const result = await service.ensureDefault(ctx);

            expect(findOne).toHaveBeenCalledWith({
                where: { customFields: { erpVatCode: 'NDS20' } },
            });
            expect(taxCategoryService.create).not.toHaveBeenCalled();
            expect(taxCategoryService.update).toHaveBeenCalledWith(ctx, {
                id: 'tax-nds20',
                isDefault: true,
            });
            expect(result).toEqual(expect.objectContaining({ id: 'tax-nds20', isDefault: true }));
        });

        it('returns undefined and changes nothing when no defaultVatCode is configured', async () => {
            const { service, taxCategoryService, findOne } = makeService();

            expect(await service.ensureDefault(ctx)).toBeUndefined();
            expect(findOne).not.toHaveBeenCalled();
            expect(taxCategoryService.update).not.toHaveBeenCalled();
        });
    });
});

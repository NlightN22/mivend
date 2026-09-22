import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { VatRateStreamHandler } from '../../handlers/vat-rate.handler';

const TAX_CATEGORY = { id: 'tax-nds20', name: 'НДС20' };
const ZONE = { id: 'zone-1', name: 'Russia' };

function makeConnection(existingRate: { id: string } | undefined): {
    getRepository: ReturnType<typeof vi.fn>;
} {
    const findOne = vi.fn().mockResolvedValue(existingRate ?? null);
    return { getRepository: vi.fn().mockReturnValue({ findOne }) };
}

function makeHandler(overrides?: {
    connection?: ReturnType<typeof makeConnection>;
    taxCategoryAutoCreateService?: { findOrCreate: ReturnType<typeof vi.fn> };
    taxZoneService?: { findOrCreateDefaultZone: ReturnType<typeof vi.fn> };
    taxRateService?: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}): {
    handler: VatRateStreamHandler;
    connection: ReturnType<typeof makeConnection>;
    taxCategoryAutoCreateService: { findOrCreate: ReturnType<typeof vi.fn> };
    taxZoneService: { findOrCreateDefaultZone: ReturnType<typeof vi.fn> };
    taxRateService: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
} {
    const connection = overrides?.connection ?? makeConnection(undefined);
    const taxCategoryAutoCreateService = overrides?.taxCategoryAutoCreateService ?? {
        findOrCreate: vi.fn().mockResolvedValue(TAX_CATEGORY),
    };
    const taxZoneService = overrides?.taxZoneService ?? {
        findOrCreateDefaultZone: vi.fn().mockResolvedValue(ZONE),
    };
    const taxRateService = overrides?.taxRateService ?? {
        create: vi.fn().mockResolvedValue({ id: 'rate-new' }),
        update: vi.fn().mockResolvedValue({ id: 'rate-existing' }),
    };

    const handler = new VatRateStreamHandler(
        connection as never,
        taxCategoryAutoCreateService as never,
        taxZoneService as never,
        taxRateService as never,
    );
    return { handler, connection, taxCategoryAutoCreateService, taxZoneService, taxRateService };
}

describe('VatRateStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when code is missing', async () => {
        const { handler, taxCategoryAutoCreateService } = makeHandler();

        await handler.apply(ctx, 'entity-1', { percent: 20 });

        expect(taxCategoryAutoCreateService.findOrCreate).not.toHaveBeenCalled();
    });

    // is_deleted is optional bool — deletions of tax config are never auto-applied, only logged.
    it('logs and does not touch TaxRate/TaxCategory when is_deleted is true', async () => {
        const { handler, taxCategoryAutoCreateService, taxRateService } = makeHandler();

        await handler.apply(ctx, 'entity-1', { code: 'НДС20', percent: 20, isDeleted: true });

        expect(taxCategoryAutoCreateService.findOrCreate).not.toHaveBeenCalled();
        expect(taxRateService.create).not.toHaveBeenCalled();
        expect(taxRateService.update).not.toHaveBeenCalled();
    });

    // percent absent means "auto-registered, not confirmed yet" — never coerced to 0 here; 0% is
    // only the initial placeholder the product-side auto-create path writes.
    it('skips the TaxRate value upsert entirely when percent is absent', async () => {
        const { handler, taxCategoryAutoCreateService, taxRateService } = makeHandler();

        await handler.apply(ctx, 'entity-1', { code: 'НДС20', zone: 'RU' });

        expect(taxCategoryAutoCreateService.findOrCreate).not.toHaveBeenCalled();
        expect(taxRateService.create).not.toHaveBeenCalled();
        expect(taxRateService.update).not.toHaveBeenCalled();
    });

    it('creates a new TaxRate when none exists yet for (erpVatCode, zone)', async () => {
        const { handler, taxCategoryAutoCreateService, taxZoneService, taxRateService } =
            makeHandler({ connection: makeConnection(undefined) });

        await handler.apply(ctx, 'entity-1', { code: 'НДС20', zone: 'RU', percent: 20 });

        expect(taxCategoryAutoCreateService.findOrCreate).toHaveBeenCalledWith(
            ctx,
            'NDS20',
            'НДС20',
        );
        expect(taxZoneService.findOrCreateDefaultZone).toHaveBeenCalledWith(ctx);
        expect(taxRateService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ value: 20, categoryId: TAX_CATEGORY.id, zoneId: ZONE.id }),
        );
        expect(taxRateService.update).not.toHaveBeenCalled();
    });

    it('upserts (updates) the existing TaxRate.value when a row already exists for (erpVatCode, zone)', async () => {
        const { handler, taxRateService } = makeHandler({
            connection: makeConnection({ id: 'rate-existing' }),
        });

        await handler.apply(ctx, 'entity-1', { code: 'НДС20', zone: 'RU', percent: 18 });

        expect(taxRateService.update).toHaveBeenCalledWith(ctx, { id: 'rate-existing', value: 18 });
        expect(taxRateService.create).not.toHaveBeenCalled();
    });

    // vat-rate is code-keyed, not product-keyed: no cross-entity lookup happens here, so a
    // VatRateChanged arriving before any product references this code is not a
    // MissingDependencyError case — it proceeds independently and creates its own TaxCategory.
    it('proceeds independently (auto-creates its own TaxCategory) even if no product has synced this code yet', async () => {
        const { handler, taxCategoryAutoCreateService } = makeHandler();

        await expect(
            handler.apply(ctx, 'entity-1', { code: 'НДС999', zone: 'RU', percent: 5 }),
        ).resolves.not.toThrow();

        expect(taxCategoryAutoCreateService.findOrCreate).toHaveBeenCalledWith(
            ctx,
            'НДС999',
            'НДС999',
        );
    });
});

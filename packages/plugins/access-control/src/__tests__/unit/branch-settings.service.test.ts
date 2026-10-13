import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GlobalSettingsService, RequestContext, TransactionalConnection } from '@vendure/core';

import { BranchSettingsService } from '../../branch-settings.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('BranchSettingsService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let getSettings: ReturnType<typeof vi.fn>;
    let service: BranchSettingsService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        getSettings = vi.fn();
        const connection = { getRepository: () => repo };
        const globalSettingsService = { getSettings } as unknown as GlobalSettingsService;
        service = new BranchSettingsService(
            connection as unknown as TransactionalConnection,
            globalSettingsService,
        );
    });

    it('creates BranchSettings for a branch with no existing row', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
        });
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                branchId: 'branch-1',
                defaultPriceTypeId: 'pt-1',
                visiblePriceTypeIds: null,
                defaultWarehouseId: 'wh-1',
                visibleWarehouseIds: null,
            }),
        );
        expect(repo.save).toHaveBeenCalled();
    });

    it('defaults packagesOnly to false when not supplied', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
        });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ packagesOnly: false }));
    });

    it('defaults allowExceedingCreditLimit to false and persists an explicit true', async () => {
        repo.findOne.mockResolvedValue(null);
        const base = {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
        };
        await service.upsert(ctx, base);
        expect(repo.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ allowExceedingCreditLimit: false }),
        );
        await service.upsert(ctx, { ...base, allowExceedingCreditLimit: true });
        expect(repo.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ allowExceedingCreditLimit: true }),
        );
    });

    it('keeps the existing allowExceedingCreditLimit when an update omits it', async () => {
        repo.findOne.mockResolvedValue({ branchId: 'branch-1', allowExceedingCreditLimit: true });
        await service.upsert(ctx, {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
        });
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ allowExceedingCreditLimit: true }),
        );
    });

    it('defaults prepaymentReserveDays to 3 and keeps the stored value when an update omits it', async () => {
        repo.findOne.mockResolvedValue(null);
        const base = {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
        };
        await service.upsert(ctx, base);
        expect(repo.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ prepaymentReserveDays: 3 }),
        );
        repo.findOne.mockResolvedValue({ branchId: 'branch-1', prepaymentReserveDays: 5 });
        await service.upsert(ctx, base);
        expect(repo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ prepaymentReserveDays: 5 }),
        );
    });

    it('defaults proformaPaymentTermDays to 3 and keeps the stored value when an update omits it', async () => {
        repo.findOne.mockResolvedValue(null);
        const base = {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
        };
        await service.upsert(ctx, base);
        expect(repo.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ proformaPaymentTermDays: 3 }),
        );
        repo.findOne.mockResolvedValue({ branchId: 'branch-1', proformaPaymentTermDays: 7 });
        await service.upsert(ctx, base);
        expect(repo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ proformaPaymentTermDays: 7 }),
        );
    });

    it('persists an explicit packagesOnly: true', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, {
            branchId: 'branch-2',
            defaultPriceTypeId: 'pt-1',
            defaultWarehouseId: 'wh-1',
            packagesOnly: true,
        });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ packagesOnly: true }));
    });

    it('updates an existing BranchSettings row in place, never creating a duplicate', async () => {
        const existing = {
            branchId: 'branch-1',
            defaultPriceTypeId: 'old',
            visiblePriceTypeIds: null,
            defaultWarehouseId: 'old-wh',
            visibleWarehouseIds: null,
        };
        repo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, {
            branchId: 'branch-1',
            defaultPriceTypeId: 'pt-2',
            visiblePriceTypeIds: ['pt-2', 'pt-3'],
            defaultWarehouseId: 'wh-2',
        });
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultPriceTypeId: 'pt-2',
                visiblePriceTypeIds: ['pt-2', 'pt-3'],
                defaultWarehouseId: 'wh-2',
            }),
        );
    });

    it('resolveEffective returns the branch own settings when configured', async () => {
        repo.findOne.mockResolvedValue({ branchId: 'branch-1', defaultPriceTypeId: 'pt-1' });
        const result = await service.resolveEffective(ctx, 'branch-1');
        expect(result).toEqual(expect.objectContaining({ branchId: 'branch-1' }));
        expect(getSettings).not.toHaveBeenCalled();
    });

    it('resolveEffective falls back to the global default branch when the requested branch has no settings', async () => {
        repo.findOne
            .mockResolvedValueOnce(null) // requested branch has none
            .mockResolvedValueOnce({
                branchId: 'branch-default',
                defaultPriceTypeId: 'pt-default',
            });
        getSettings.mockResolvedValue({ customFields: { defaultBranchId: 'branch-default' } });
        const result = await service.resolveEffective(ctx, 'branch-1');
        expect(result).toEqual(expect.objectContaining({ branchId: 'branch-default' }));
    });

    it('resolveEffective falls back to the global default branch when no branchId is given at all', async () => {
        repo.findOne.mockResolvedValue({
            branchId: 'branch-default',
            defaultPriceTypeId: 'pt-default',
        });
        getSettings.mockResolvedValue({ customFields: { defaultBranchId: 'branch-default' } });
        const result = await service.resolveEffective(ctx, null);
        expect(result).toEqual(expect.objectContaining({ branchId: 'branch-default' }));
    });

    it('resolveEffective returns null (never throws, never fabricates) when the system has no Branch/BranchSettings data at all', async () => {
        repo.findOne.mockResolvedValue(null);
        getSettings.mockResolvedValue({ customFields: {} });
        const result = await service.resolveEffective(ctx, null);
        expect(result).toBeNull();
    });

    it('resolveEffective returns null when a branchId is given but neither it nor the global default resolves', async () => {
        repo.findOne.mockResolvedValue(null);
        getSettings.mockResolvedValue({ customFields: { defaultBranchId: null } });
        const result = await service.resolveEffective(ctx, 'branch-unknown');
        expect(result).toBeNull();
    });
});

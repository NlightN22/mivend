import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GlobalSettingsService, ProcessContext, TransactionalConnection } from '@vendure/core';

import { BranchSettingsService } from '../../branch-settings.service';
import { DefaultBranchBootstrapService } from '../../default-branch-bootstrap.service';
import type { AccessControlPluginOptions } from '../../types';

describe('DefaultBranchBootstrapService', () => {
    let branchRepo: Record<string, ReturnType<typeof vi.fn>>;
    let settingsRepo: Record<string, ReturnType<typeof vi.fn>>;
    let query: ReturnType<typeof vi.fn>;
    let updateSettings: ReturnType<typeof vi.fn>;
    let getGlobalDefaultBranchId: ReturnType<typeof vi.fn>;
    let isWorker: boolean;

    function build(options: AccessControlPluginOptions): DefaultBranchBootstrapService {
        const connection = {
            getRepository: (_ctx: unknown, entity: { name: string }) =>
                entity.name === 'Branch' ? branchRepo : settingsRepo,
            rawConnection: { query },
        };
        return new DefaultBranchBootstrapService(
            connection as unknown as TransactionalConnection,
            { updateSettings } as unknown as GlobalSettingsService,
            { getGlobalDefaultBranchId } as unknown as BranchSettingsService,
            {
                get isWorker() {
                    return isWorker;
                },
            } as unknown as ProcessContext,
            options,
        );
    }

    beforeEach(() => {
        isWorker = false;
        branchRepo = {
            findOne: vi.fn().mockResolvedValue(null),
            create: vi.fn((x: unknown) => x),
            save: vi.fn(async (x: object) => ({ id: 7, ...x })),
        };
        settingsRepo = {
            findOne: vi.fn().mockResolvedValue(null),
            create: vi.fn((x: unknown) => x),
            save: vi.fn(async (x: unknown) => x),
        };
        query = vi.fn().mockResolvedValue([{ id: 3 }]);
        updateSettings = vi.fn();
        getGlobalDefaultBranchId = vi.fn().mockResolvedValue(null);
    });

    it('creates the branch, sets it as default and creates its settings with the price type', async () => {
        await build({
            centralBranchName: 'Central',
            defaultPriceTypeCode: 'RETAIL',
        }).onApplicationBootstrap();
        expect(branchRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Central' }));
        expect(updateSettings).toHaveBeenCalledWith(expect.anything(), {
            customFields: { defaultBranchId: '7' },
        });
        expect(settingsRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                branchId: '7',
                defaultPriceTypeId: '3',
                defaultWarehouseId: null,
            }),
        );
    });

    it('does not override a default branch or settings an admin already set', async () => {
        getGlobalDefaultBranchId.mockResolvedValue('42');
        settingsRepo.findOne.mockResolvedValue({ branchId: '42' });
        await build({
            centralBranchName: 'Central',
            defaultPriceTypeCode: 'RETAIL',
        }).onApplicationBootstrap();
        expect(branchRepo.save).not.toHaveBeenCalled();
        expect(updateSettings).not.toHaveBeenCalled();
        expect(settingsRepo.save).not.toHaveBeenCalled();
    });

    it('reuses an already-bootstrapped branch on re-run (idempotent)', async () => {
        branchRepo.findOne.mockResolvedValue({ id: 7 });
        await build({ centralBranchName: 'Central' }).onApplicationBootstrap();
        expect(branchRepo.save).not.toHaveBeenCalled();
        expect(updateSettings).toHaveBeenCalledTimes(1);
    });

    it('leaves the price unset when the configured price type does not exist', async () => {
        query.mockResolvedValue([]);
        await build({
            centralBranchName: 'Central',
            defaultPriceTypeCode: 'MISSING',
        }).onApplicationBootstrap();
        expect(settingsRepo.save).not.toHaveBeenCalled();
    });

    it('does nothing without centralBranchName or on the worker process', async () => {
        await build({}).onApplicationBootstrap();
        isWorker = true;
        await build({ centralBranchName: 'Central' }).onApplicationBootstrap();
        expect(getGlobalDefaultBranchId).not.toHaveBeenCalled();
    });

    it('swallows a bootstrap failure instead of crashing startup', async () => {
        getGlobalDefaultBranchId.mockRejectedValue(new Error('db down'));
        await expect(
            build({ centralBranchName: 'Central' }).onApplicationBootstrap(),
        ).resolves.toBeUndefined();
    });
});

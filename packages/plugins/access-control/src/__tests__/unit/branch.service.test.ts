import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GlobalSettingsService, RequestContext, TransactionalConnection } from '@vendure/core';

import { BranchService } from '../../branch.service';
import type { BranchSettingsService } from '../../branch-settings.service';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    withAggregateLock: vi.fn(
        async (_c: unknown, ctx: unknown, _k: string, work: (c: unknown) => Promise<unknown>) =>
            work(ctx),
    ),
}));

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        find: vi.fn(async () => [] as unknown[]),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('BranchService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: BranchService;
    let updateSettings: ReturnType<typeof vi.fn>;
    let getGlobalDefaultBranchId: ReturnType<typeof vi.fn>;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        updateSettings = vi.fn();
        getGlobalDefaultBranchId = vi.fn().mockResolvedValue(null);
        service = new BranchService(
            connection as unknown as TransactionalConnection,
            { updateSettings } as unknown as GlobalSettingsService,
            { getGlobalDefaultBranchId } as unknown as BranchSettingsService,
        );
    });

    it('creates a new branch when no row matches the erpId', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, { erpId: 'branch-central', name: 'Central branch' });
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({ erpId: 'branch-central', name: 'Central branch' }),
        );
        expect(repo.save).toHaveBeenCalled();
    });

    it('updates an existing branch in place, never creating a duplicate', async () => {
        const existing = { erpId: 'branch-central', name: 'Old name' };
        repo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, { erpId: 'branch-central', name: 'New name' });
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New name' }));
    });

    it('findAll returns rows ordered by name', async () => {
        await service.findAll(ctx);
        expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' }, take: 1001 });
    });

    it('createManual generates a prefixed erpId that can never collide with a real ERP GUID', async () => {
        const branch = await service.createManual(ctx, 'Warehouse district A');
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Warehouse district A',
                erpId: expect.stringMatching(/^mivend-manual:/),
            }),
        );
        expect(repo.save).toHaveBeenCalled();
        expect((branch as { name: string }).name).toBe('Warehouse district A');
    });

    it('createManual generates a different erpId on each call', async () => {
        const a = await service.createManual(ctx, 'Branch A');
        const b = await service.createManual(ctx, 'Branch B');
        expect((a as { erpId: string }).erpId).not.toBe((b as { erpId: string }).erpId);
    });

    describe('names (#286)', () => {
        beforeEach(() => {
            repo.find.mockResolvedValue([
                { id: 1, name: 'Branch A', erpId: 'mivend-bootstrap:Main' },
                { id: 2, name: 'Branch B', erpId: 'mivend-manual:x' },
            ]);
        });

        it('renames in place and never touches the erpId', async () => {
            const row = { id: 1, name: 'Branch A', erpId: 'mivend-bootstrap:Main' };
            repo.findOne.mockResolvedValue(row);
            await service.rename(ctx, '1', '  North  ');
            expect(repo.save).toHaveBeenCalledWith({
                id: 1,
                name: 'North',
                erpId: 'mivend-bootstrap:Main',
            });
        });

        it('allows keeping or re-casing the same branch name', async () => {
            repo.findOne.mockResolvedValue({ id: 1, name: 'Branch A' });
            await expect(service.rename(ctx, '1', 'BRANCH a')).resolves.toBeDefined();
        });

        it('rejects a name another branch has, ignoring case, on rename and create', async () => {
            repo.findOne.mockResolvedValue({ id: 1, name: 'Branch A' });
            await expect(service.rename(ctx, '1', 'branch b')).rejects.toThrow(/already exists/);
            await expect(service.createManual(ctx, ' BRANCH B ')).rejects.toThrow(/already exists/);
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('rejects an empty name and an unknown branch', async () => {
            await expect(service.rename(ctx, '1', '   ')).rejects.toThrow(/must not be empty/);
            repo.findOne.mockResolvedValue(null);
            await expect(service.rename(ctx, '9', 'Other')).rejects.toThrow(/not found/);
        });
    });

    describe('default branch (#286)', () => {
        it('moves the default to an existing branch', async () => {
            repo.findOne.mockResolvedValue({ id: 2, name: 'Branch B' });
            await service.setDefault(ctx, '2');
            expect(updateSettings).toHaveBeenCalledWith(ctx, {
                customFields: { defaultBranchId: '2' },
            });
        });

        it('rejects an unknown branch and leaves the default untouched', async () => {
            repo.findOne.mockResolvedValue(null);
            await expect(service.setDefault(ctx, '9')).rejects.toThrow(/not found/);
            expect(updateSettings).not.toHaveBeenCalled();
        });

        it('marks exactly the default branch and no branch without a default', async () => {
            getGlobalDefaultBranchId.mockResolvedValue('2');
            expect(await service.isDefault(ctx, 2)).toBe(true);
            expect(await service.isDefault(ctx, '1')).toBe(false);
            getGlobalDefaultBranchId.mockResolvedValue(null);
            expect(await service.isDefault(ctx, 2)).toBe(false);
        });
    });
});

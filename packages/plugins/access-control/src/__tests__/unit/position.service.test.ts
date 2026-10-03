import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { PositionService } from '../../position.service';

describe('PositionService', () => {
    const ctx = {} as unknown as RequestContext;
    const record = { erpId: 'pos-1', name: 'Manager', parentErpId: null, isActive: true };
    let repo: Record<string, ReturnType<typeof vi.fn>>;
    let service: PositionService;

    beforeEach(() => {
        repo = {
            findOne: vi.fn(),
            create: vi.fn((x: unknown) => x),
            save: vi.fn(async (x: unknown) => x) as unknown as ReturnType<typeof vi.fn>,
        };
        service = new PositionService({
            getRepository: () => repo,
        } as unknown as TransactionalConnection);
    });

    it('creates when no row matches erpId', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, record);
        expect(repo.create).toHaveBeenCalledWith(record);
    });

    it('updates the existing row in place, never duplicating', async () => {
        const existing = { id: 5, ...record, name: 'Old' };
        repo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, { ...record, name: 'New', isActive: false });
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 5, name: 'New', isActive: false }),
        );
    });

    it('setActiveStateIfExists returns false without saving when unknown', async () => {
        repo.findOne.mockResolvedValue(null);
        expect(await service.setActiveStateIfExists(ctx, 'x', false)).toBe(false);
        expect(repo.save).not.toHaveBeenCalled();
    });
});

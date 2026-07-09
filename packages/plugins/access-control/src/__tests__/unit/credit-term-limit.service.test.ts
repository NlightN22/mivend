import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { CreditTermLimitService } from '../../credit-term-limit.service';

function createMockRepo() {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
    };
}

describe('CreditTermLimitService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: CreditTermLimitService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        service = new CreditTermLimitService(connection as unknown as TransactionalConnection);
    });

    it('returns null when no limit is configured for the role', async () => {
        repo.findOne.mockResolvedValue(null);
        expect(await service.getLimit(ctx, 'department-head')).toBeNull();
    });

    it('creates a new limit row when none exists', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.setLimit(ctx, 'department-head', 14, 500000);
        expect(repo.create).toHaveBeenCalledWith({
            roleCode: 'department-head',
            maxExtraDays: 14,
            maxAmount: 500000,
        });
        expect(repo.save).toHaveBeenCalled();
    });

    it('updates an existing limit row in place, never duplicating it', async () => {
        const existing = { roleCode: 'department-head', maxExtraDays: 7, maxAmount: null };
        repo.findOne.mockResolvedValue(existing);
        await service.setLimit(ctx, 'department-head', 14, 500000);
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ maxExtraDays: 14, maxAmount: 500000 }),
        );
    });
});

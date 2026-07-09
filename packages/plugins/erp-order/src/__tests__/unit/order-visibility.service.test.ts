import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ListQueryBuilder, RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { OrderVisibilityService } from '../../order-visibility.service';

function mockQueryBuilder() {
    const qb: Record<string, ReturnType<typeof vi.fn>> = { alias: vi.fn() as unknown as never };
    (qb as unknown as { alias: string }).alias = 'order';
    qb.leftJoinAndSelect = vi.fn(() => qb);
    qb.leftJoin = vi.fn(() => qb);
    qb.andWhere = vi.fn(() => qb);
    qb.getManyAndCount = vi.fn(async () => [[], 0]);
    return qb;
}

const mockCtx = {} as unknown as RequestContext;

describe('OrderVisibilityService', () => {
    let listQueryBuilder: { build: ReturnType<typeof vi.fn> };
    let accessScopeService: { resolveOrderScope: ReturnType<typeof vi.fn> };
    let service: OrderVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;

    beforeEach(() => {
        qb = mockQueryBuilder();
        listQueryBuilder = { build: vi.fn(() => qb) };
        accessScopeService = { resolveOrderScope: vi.fn() };
        service = new OrderVisibilityService(
            listQueryBuilder as unknown as ListQueryBuilder,
            accessScopeService as unknown as AccessScopeService,
        );
    });

    it('filters by assignedManagerId for "own" scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-1',
        });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).toHaveBeenCalledWith('counterparty.assignedManagerId = :managerId', {
            managerId: 'admin-1',
        });
    });

    it('filters by department/branch for "department" scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-1',
        });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).toHaveBeenCalledWith(
            'counterparty.departmentId = :departmentId AND counterparty.branchId = :branchId',
            { departmentId: 'dept-1', branchId: 'branch-1' },
        );
    });

    it('applies no extra filter for "all" scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('filters by managerId when provided, in addition to scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, 'admin-9');

        expect(qb.andWhere).toHaveBeenCalledWith(
            'counterparty.assignedManagerId = :filterManagerId',
            {
                filterManagerId: 'admin-9',
            },
        );
    });

    it('joins customer and counterparty before applying scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('order.customer', 'customer');
        expect(qb.leftJoin).toHaveBeenCalled();
    });
});

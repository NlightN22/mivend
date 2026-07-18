import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Brackets } from 'typeorm';
import type { ListQueryBuilder, RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { OrderVisibilityService } from '../../order-visibility.service';

function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
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
    let accessScopeService: {
        resolveOrderScope: ReturnType<typeof vi.fn>;
        applyOwnCounterpartyFilter: ReturnType<typeof vi.fn>;
    };
    let service: OrderVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;

    beforeEach(() => {
        qb = mockQueryBuilder();
        listQueryBuilder = { build: vi.fn(() => qb) };
        accessScopeService = {
            resolveOrderScope: vi.fn(),
            // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter) rather
            // than a no-op stub — these tests assert the actual SQL fragment produced.
            applyOwnCounterpartyFilter: vi.fn((builder, alias, administratorId) => {
                builder.andWhere(
                    `(${alias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${alias}.id
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
                    { ownScopeAdminId: administratorId ?? null },
                );
            }),
        };
        service = new OrderVisibilityService(
            listQueryBuilder as unknown as ListQueryBuilder,
            accessScopeService as unknown as AccessScopeService,
        );
    });

    it('filters by assignedManagerId OR team membership for "own" scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-1',
        });

        await service.findVisible(mockCtx);

        expect(accessScopeService.applyOwnCounterpartyFilter).toHaveBeenCalledWith(
            qb,
            'counterparty',
            'admin-1',
        );
    });

    it('filters by department + the order\'s own servicing branch for "department" scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-1',
        });

        await service.findVisible(mockCtx);

        // Filters by the order's own denormalized branchId (customFieldsBranchid), not
        // Counterparty.branchId — a chain account's orders can be serviced by a different
        // branch than the customer's nominal "home" branch, see order-visibility.service.ts.
        expect(qb.andWhere).toHaveBeenCalledWith(
            'counterparty.departmentId = :departmentId AND order."customFieldsBranchid" = :branchId',
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

    it('filters by customerId when provided, in addition to scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, undefined, 'cust-9');

        expect(qb.andWhere).toHaveBeenCalledWith('customer.id = :filterCustomerId', {
            filterCustomerId: 'cust-9',
        });
    });

    it('applies a bracketed OR search across code, phone, company name and INN', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, undefined, undefined, 'acme');

        expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('does not add a search filter when search is empty', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).not.toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('joins customer and counterparty before applying scope', async () => {
        accessScopeService.resolveOrderScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('order.customer', 'customer');
        expect(qb.leftJoin).toHaveBeenCalled();
    });
});

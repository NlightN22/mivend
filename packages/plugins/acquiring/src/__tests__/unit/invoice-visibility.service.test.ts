import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { InvoiceVisibilityService } from '../../invoice-visibility.service';

function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    qb.leftJoin = vi.fn(() => qb);
    qb.andWhere = vi.fn(() => qb);
    qb.orderBy = vi.fn(() => qb);
    qb.addOrderBy = vi.fn(() => qb);
    qb.skip = vi.fn(() => qb);
    qb.take = vi.fn(() => qb);
    qb.getManyAndCount = vi.fn(async () => [[], 0]);
    return qb;
}

const mockCtx = {} as unknown as RequestContext;

describe('InvoiceVisibilityService', () => {
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let accessScopeService: { resolveInvoiceScope: ReturnType<typeof vi.fn> };
    let service: InvoiceVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;

    beforeEach(() => {
        qb = mockQueryBuilder();
        connection = { getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })) };
        accessScopeService = { resolveInvoiceScope: vi.fn() };
        service = new InvoiceVisibilityService(
            connection as unknown as TransactionalConnection,
            accessScopeService as unknown as AccessScopeService,
        );
    });

    it('filters by assignedManagerId for "own" scope, with no branch restriction', async () => {
        accessScopeService.resolveInvoiceScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-1',
        });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).toHaveBeenCalledWith('counterparty.assignedManagerId = :managerId', {
            managerId: 'admin-1',
        });
    });

    it('filters by department + the invoice\'s own denormalized branch for "department" scope', async () => {
        accessScopeService.resolveInvoiceScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-1',
        });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).toHaveBeenCalledWith(
            'counterparty.departmentId = :departmentId AND invoice.branchId = :branchId',
            { departmentId: 'dept-1', branchId: 'branch-1' },
        );
    });

    it('applies no scope filter for "all" scope', async () => {
        accessScopeService.resolveInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('filters by status when provided, in addition to scope', async () => {
        accessScopeService.resolveInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { status: 'paid' });

        expect(qb.andWhere).toHaveBeenCalledWith('invoice.status = :status', { status: 'paid' });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { InvoiceVisibilityService } from '../../invoice-visibility.service';

// Deliberately un-annotated (not `Record<string, ReturnType<typeof vi.fn>>`) — an explicit
// annotation here defeats TS's own inference of each mock's real call signature and produces
// spurious "Mock<...> not assignable to Mock<any[], unknown>" errors (same fix as this
// session's other query-builder mocks).
function mockQueryBuilder() {
    const qb = {
        leftJoin: vi.fn(),
        andWhere: vi.fn(),
        orderBy: vi.fn(),
        addOrderBy: vi.fn(),
        skip: vi.fn(),
        take: vi.fn(),
        getManyAndCount: vi.fn(async () => [[], 0]),
    };
    qb.leftJoin.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    return qb;
}

const mockCtx = {} as unknown as RequestContext;

describe('InvoiceVisibilityService', () => {
    let service: InvoiceVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;
    let accessScopeService: {
        resolveInvoiceScope: ReturnType<typeof vi.fn>;
        applyOwnCounterpartyFilter: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        qb = mockQueryBuilder();
        const connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
        };
        accessScopeService = {
            resolveInvoiceScope: vi.fn(),
            // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter).
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
        service = new InvoiceVisibilityService(
            connection as unknown as TransactionalConnection,
            accessScopeService as unknown as AccessScopeService,
        );
    });

    it('filters by assignedManagerId OR team membership for "own" scope, with no branch restriction', async () => {
        accessScopeService.resolveInvoiceScope.mockResolvedValue({
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

    it('filters by counterpartyId when provided, in addition to scope', async () => {
        accessScopeService.resolveInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, 'cnt-1');

        expect(qb.andWhere).toHaveBeenCalledWith('invoice.counterpartyId = :counterpartyId', {
            counterpartyId: 'cnt-1',
        });
    });
});

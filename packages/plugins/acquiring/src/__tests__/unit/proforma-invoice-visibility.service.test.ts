import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { ProformaInvoiceVisibilityService } from '../../proforma-invoice-visibility.service';

// Don't annotate: an explicit type defeats TS's inference of each mock's real call signature
// and causes spurious 'Mock<...> not assignable to Mock<any[], unknown>' errors.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest Mock<> return type is awkward to spell out
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

// Don't annotate as ReturnType<typeof vi.fn>: it widens to Mock<any[], unknown> and fails to
// accept the concrete callback's Mock. Derive the type from the factory's ReturnType instead.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest Mock<> return type is awkward to spell out
function mockAccessScopeService() {
    return {
        resolveProformaInvoiceScope: vi.fn(),
        // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter).
        applyOwnCounterpartyFilter: vi.fn(
            (
                builder: { andWhere: (sql: string, params: Record<string, unknown>) => void },
                alias: string,
                administratorId: string | undefined,
            ) => {
                builder.andWhere(
                    `(${alias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${alias}.id
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
                    { ownScopeAdminId: administratorId ?? null },
                );
            },
        ),
    };
}

describe('ProformaInvoiceVisibilityService', () => {
    let service: ProformaInvoiceVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;
    let accessScopeService: ReturnType<typeof mockAccessScopeService>;

    beforeEach(() => {
        qb = mockQueryBuilder();
        const connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
        };
        accessScopeService = mockAccessScopeService();
        service = new ProformaInvoiceVisibilityService(
            connection as unknown as TransactionalConnection,
            accessScopeService as unknown as AccessScopeService,
        );
    });

    it('filters by assignedManagerId OR team membership for "own" scope, with no branch restriction', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({
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

    it('filters by the proforma invoice\'s own denormalized branch for "department" scope, ignoring departmentId entirely', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-1',
        });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).toHaveBeenCalledWith('proformaInvoice.branchId = :branchId', {
            branchId: 'branch-1',
        });
    });

    it('applies no scope filter for "all" scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('filters by status when provided, in addition to scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { status: 'paid' });

        expect(qb.andWhere).toHaveBeenCalledWith('proformaInvoice.status = :status', {
            status: 'paid',
        });
    });

    it('filters by search (number substring) when provided, in addition to scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { search: '42' });

        expect(qb.andWhere).toHaveBeenCalledWith('proformaInvoice.number ILIKE :search', {
            search: '%42%',
        });
    });

    it('filters by counterpartyId when provided, in addition to scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, 'cnt-1');

        expect(qb.andWhere).toHaveBeenCalledWith(
            'proformaInvoice.counterpartyId = :counterpartyId',
            {
                counterpartyId: 'cnt-1',
            },
        );
    });
});

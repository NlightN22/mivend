import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Brackets } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
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
        clone: vi.fn(),
        select: vi.fn(),
        addSelect: vi.fn(),
        offset: vi.fn(),
        limit: vi.fn(),
        getRawOne: vi.fn(async () => ({ total: '0' })),
        getRawAndEntities: vi.fn(async () => ({ entities: [], raw: [] })),
    };
    qb.clone.mockReturnValue(qb);
    qb.select.mockReturnValue(qb);
    qb.addSelect.mockReturnValue(qb);
    qb.offset.mockReturnValue(qb);
    qb.limit.mockReturnValue(qb);
    qb.leftJoin.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    return qb;
}

const mockCtx = {} as unknown as RequestContext;

// Don't annotate as ReturnType<typeof vi.fn>: it widens to Mock<any[], unknown> and fails to
// accept the concrete callback's Mock. Derive the type from the factory's ReturnType instead.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest Mock<> return type is awkward to spell out
function mockAccessScopeService() {
    return {
        resolveProformaInvoiceScope: vi.fn(),
        managerClause: (...args: Parameters<AccessScopeService['managerClause']>) =>
            new AccessScopeService({} as never, {} as never, {} as never).managerClause(...args),
        // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter).
        applyOwnCounterpartyFilter: vi.fn(
            (
                builder: { andWhere: (sql: string, params: Record<string, unknown>) => void },
                alias: string,
                scope: { administratorId?: string },
            ) => {
                builder.andWhere(
                    `(${alias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${alias}.id
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
                    { ownScopeAdminId: scope.administratorId ?? null },
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
            getRepository: vi.fn(() => ({
                createQueryBuilder: vi.fn(() => qb),
                metadata: { columns: [{ propertyName: 'id' }, { propertyName: 'lines' }] },
            })),
        };
        accessScopeService = mockAccessScopeService();
        service = new ProformaInvoiceVisibilityService(
            connection as unknown as TransactionalConnection,
            accessScopeService as unknown as AccessScopeService,
            { getGlobalDefaultBranchId: vi.fn(async () => 'branch-default') } as never,
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
            expect.objectContaining({ kind: 'own', administratorId: 'admin-1' }),
        );
    });

    it('resolves the proforma branch at read time for "department" scope, ignoring the snapshot and departmentId', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-1',
        });

        await service.findVisible(mockCtx);

        const [sql, params] = qb.andWhere.mock.calls[0];
        expect(qb.leftJoin).toHaveBeenCalledWith(
            'order',
            'proformaInvoiceOrder',
            '"proformaInvoiceOrder".id = "proformaInvoice"."orderId"',
        );
        expect(qb.leftJoin).toHaveBeenCalledWith(
            'trading_point',
            'proformaInvoiceTradingPoint',
            '"proformaInvoiceTradingPoint".id::text = "proformaInvoiceOrder"."customFieldsTradingpointid"',
        );
        expect(sql).toContain('"proformaInvoiceTradingPoint"."servicingBranchId"');
        expect(sql).not.toContain('SELECT');
        expect(sql).toContain('counterparty."branchId"');
        expect(sql).not.toContain('proformaInvoice.branchId');
        expect(sql).not.toContain('IS NULL');
        expect(params).toEqual({ branchId: 'branch-1', orderDefaultBranchId: 'branch-default' });
    });

    it('applies no scope filter and no branch joins for "all" scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx);

        expect(qb.andWhere).not.toHaveBeenCalled();
        expect(qb.leftJoin).toHaveBeenCalledTimes(1);
    });

    it('joins counterparty on typed ids, selects list columns without lines and the counterparty short name', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });
        qb.getRawOne.mockResolvedValue({ total: '7' });
        qb.getRawAndEntities.mockResolvedValue({
            entities: [{ id: 1 }] as never[],
            raw: [{ counterpartyShortName: 'Acme' }] as never[],
        });

        const result = await service.findVisible(mockCtx, { skip: 10, take: 5 });

        expect(qb.leftJoin.mock.calls[0][2]).not.toContain('::text');
        expect(qb.select).toHaveBeenLastCalledWith(['proformaInvoice.id']);
        expect(qb.addSelect).toHaveBeenCalledWith(
            'counterparty.shortName',
            'counterpartyShortName',
        );
        expect(qb.offset).toHaveBeenCalledWith(10);
        expect(qb.limit).toHaveBeenCalledWith(5);
        expect(result).toEqual({
            items: [{ id: 1, counterpartyShortName: 'Acme' }],
            totalItems: 7,
        });
    });

    it('take 0 returns only the count without loading rows', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });
        qb.getRawOne.mockResolvedValue({ total: '3' });

        const result = await service.findVisible(mockCtx, { take: 0 });

        expect(qb.getRawAndEntities).not.toHaveBeenCalled();
        expect(result).toEqual({ items: [], totalItems: 3 });
    });

    it('filters by status when provided, in addition to scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { status: 'paid' });

        expect(qb.andWhere).toHaveBeenCalledWith('proformaInvoice.status = :status', {
            status: 'paid',
        });
    });

    it('filters by search (number or customer) when provided, in addition to scope', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { search: '42' });

        const brackets = qb.andWhere.mock.calls
            .map(call => call[0])
            .find((arg): arg is Brackets => arg instanceof Brackets);
        const inner = {
            where: vi.fn().mockReturnThis(),
            orWhere: vi.fn().mockReturnThis(),
        };
        brackets?.whereFactory(inner as never);
        expect(inner.where).toHaveBeenCalledWith('proformaInvoice.number ILIKE :search', {
            search: '%42%',
        });
        expect(inner.orWhere).toHaveBeenCalledWith('counterparty.shortName ILIKE :term', {
            term: '%42%',
        });
    });

    it('escapes LIKE wildcards in the customer part of the search', async () => {
        accessScopeService.resolveProformaInvoiceScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { search: '5%_' });

        const brackets = qb.andWhere.mock.calls
            .map(call => call[0])
            .find((arg): arg is Brackets => arg instanceof Brackets);
        const inner = { where: vi.fn().mockReturnThis(), orWhere: vi.fn().mockReturnThis() };
        brackets?.whereFactory(inner as never);
        expect(inner.orWhere).toHaveBeenCalledWith('counterparty.inn ILIKE :term', {
            term: '%5\\%\\_%',
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

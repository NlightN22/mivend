import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { PaymentVisibilityService } from '../../payment-visibility.service';
import { InvoiceVisibilityService } from '../../invoice-visibility.service';

// Deliberately un-annotated object literal (not `Record<string, ReturnType<typeof vi.fn>>`) — an
// explicit annotation defeats TS's inference of each mock's real call signature and produces
// spurious "Mock<...> not assignable to Mock<any[], unknown>" errors (same fix as this session's
// other query-builder mocks). getRawAndEntities is typed loosely (Record<string, unknown>[])
// since individual tests reassign it with differently-shaped raw/entity rows.
function mockQueryBuilder() {
    const qb = {
        innerJoin: vi.fn(),
        leftJoin: vi.fn(),
        andWhere: vi.fn(),
        addSelect: vi.fn(),
        orderBy: vi.fn(),
        addOrderBy: vi.fn(),
        skip: vi.fn(),
        take: vi.fn(),
        getCount: vi.fn(async () => 0),
        getRawAndEntities: vi.fn(
            async (): Promise<{
                entities: Record<string, unknown>[];
                raw: Record<string, unknown>[];
            }> => ({
                entities: [],
                raw: [],
            }),
        ),
    };
    qb.innerJoin.mockReturnValue(qb);
    qb.leftJoin.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.addSelect.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    return qb;
}

const mockCtx = {} as unknown as RequestContext;

describe('PaymentVisibilityService', () => {
    let invoiceVisibilityService: {
        resolveScope: ReturnType<typeof vi.fn>;
        applyScope: ReturnType<typeof vi.fn>;
    };
    let service: PaymentVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;

    beforeEach(() => {
        qb = mockQueryBuilder();
        const connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
        };
        invoiceVisibilityService = { resolveScope: vi.fn(), applyScope: vi.fn() };
        service = new PaymentVisibilityService(
            connection as unknown as TransactionalConnection,
            invoiceVisibilityService as unknown as InvoiceVisibilityService,
        );
    });

    it('reuses InvoiceVisibilityService to resolve and apply scope, joined on invoice/counterparty', async () => {
        const scope = { kind: 'department', departmentId: 'd1', branchId: 'b1' };
        invoiceVisibilityService.resolveScope.mockResolvedValue(scope);

        await service.findVisible(mockCtx);

        expect(invoiceVisibilityService.resolveScope).toHaveBeenCalledWith(mockCtx);
        expect(invoiceVisibilityService.applyScope).toHaveBeenCalledWith(
            qb,
            scope,
            'invoice',
            'counterparty',
        );
    });

    it('filters by status/channel when provided, in addition to scope', async () => {
        invoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { status: 'captured', channel: 'branch-kassa' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.paymentStatus = :paymentStatus', {
            paymentStatus: 'captured',
        });
        expect(qb.andWhere).toHaveBeenCalledWith('payment.channel = :channel', {
            channel: 'branch-kassa',
        });
    });

    it('filters by counterpartyId when provided, in addition to scope', async () => {
        invoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, 'cnt-1');

        expect(qb.andWhere).toHaveBeenCalledWith('invoice.counterpartyId = :counterpartyId', {
            counterpartyId: 'cnt-1',
        });
    });

    it('attaches counterpartyId from the joined invoice raw row onto each returned item', async () => {
        invoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });
        qb.getRawAndEntities.mockResolvedValue({
            entities: [{ id: 'p1' }],
            raw: [{ invoice_counterpartyId: 'cnt-9' }],
        });

        const result = await service.findVisible(mockCtx);

        expect(result.items[0]).toMatchObject({ id: 'p1', counterpartyId: 'cnt-9' });
    });
});

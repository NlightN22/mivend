import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Brackets } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { PaymentVisibilityService } from '../../payment-visibility.service';
import { ProformaInvoiceVisibilityService } from '../../proforma-invoice-visibility.service';

// Left un-annotated on purpose: an explicit Mock type breaks TS's inference of each mock's signature
// getRawAndEntities is loosely typed: tests reassign it with rows of different shapes.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest Mock<> return type is awkward to spell out
function mockQueryBuilder() {
    const qb = {
        innerJoin: vi.fn(),
        leftJoin: vi.fn(),
        andWhere: vi.fn(),
        addSelect: vi.fn(),
        orderBy: vi.fn(),
        addOrderBy: vi.fn(),
        offset: vi.fn(),
        limit: vi.fn(),
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
    qb.offset.mockReturnValue(qb);
    qb.limit.mockReturnValue(qb);
    return qb;
}

const mockCtx = {} as unknown as RequestContext;

describe('PaymentVisibilityService', () => {
    let proformaInvoiceVisibilityService: {
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
        proformaInvoiceVisibilityService = { resolveScope: vi.fn(), applyScope: vi.fn() };
        service = new PaymentVisibilityService(
            connection as unknown as TransactionalConnection,
            proformaInvoiceVisibilityService as unknown as ProformaInvoiceVisibilityService,
        );
    });

    it('reuses ProformaInvoiceVisibilityService to resolve and apply scope, joined on proforma invoice/counterparty', async () => {
        const scope = { kind: 'department', departmentId: 'd1', branchId: 'b1' };
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue(scope);

        await service.findVisible(mockCtx);

        expect(proformaInvoiceVisibilityService.resolveScope).toHaveBeenCalledWith(mockCtx);
        expect(proformaInvoiceVisibilityService.applyScope).toHaveBeenCalledWith(
            qb,
            scope,
            'proformaInvoice',
            'counterparty',
        );
    });

    it('filters by status/channel when provided, in addition to scope', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { status: 'captured', channel: 'branch-kassa' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.paymentStatus = :paymentStatus', {
            paymentStatus: 'captured',
        });
        expect(qb.andWhere).toHaveBeenCalledWith('payment.channel = :channel', {
            channel: 'branch-kassa',
        });
    });

    it('search matches the number, customer name or INN in one bracket, in addition to scope', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { search: '42' });

        expect(qb.andWhere.mock.calls.some(([arg]) => arg instanceof Brackets)).toBe(true);
    });

    it('applies the scope before the client filter and returns only a count for take 0', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });
        qb.getCount.mockResolvedValue(7);
        const order: string[] = [];
        proformaInvoiceVisibilityService.applyScope.mockImplementation(() => order.push('scope'));
        qb.andWhere.mockImplementation(() => {
            order.push('filter');
            return qb;
        });

        const result = await service.findVisible(mockCtx, {
            take: 0,
            filter: { amount: { gt: 5 } },
        });

        expect(order).toEqual(['scope', 'filter']);
        expect(result).toEqual({ items: [], totalItems: 7 });
        expect(qb.getRawAndEntities).not.toHaveBeenCalled();
    });

    it('filters by counterpartyId when provided, in addition to scope', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, undefined, 'cnt-1');

        expect(qb.andWhere).toHaveBeenCalledWith(
            'proformaInvoice.counterpartyId = :counterpartyId',
            {
                counterpartyId: 'cnt-1',
            },
        );
    });

    it('attaches counterpartyId from the joined proforma invoice raw row onto each returned item', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });
        qb.getRawAndEntities.mockResolvedValue({
            entities: [{ id: 'p1' }],
            raw: [{ proformaInvoice_counterpartyId: 'cnt-9' }],
        });

        const result = await service.findVisible(mockCtx);

        expect(result.items[0]).toMatchObject({ id: 'p1', counterpartyId: 'cnt-9' });
    });
});

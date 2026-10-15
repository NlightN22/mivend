import { describe, it, expect, vi, beforeEach } from 'vitest';
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

    it('filters by search (number substring) when provided, in addition to scope', async () => {
        proformaInvoiceVisibilityService.resolveScope.mockResolvedValue({ kind: 'all' });

        await service.findVisible(mockCtx, { search: '42' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.number ILIKE :search', {
            search: '%42%',
        });
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { PaymentVisibilityService } from '../../payment-visibility.service';
import { InvoiceVisibilityService } from '../../invoice-visibility.service';

function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    qb.innerJoin = vi.fn(() => qb);
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

describe('PaymentVisibilityService', () => {
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let invoiceVisibilityService: {
        resolveScope: ReturnType<typeof vi.fn>;
        applyScope: ReturnType<typeof vi.fn>;
    };
    let service: PaymentVisibilityService;
    let qb: ReturnType<typeof mockQueryBuilder>;

    beforeEach(() => {
        qb = mockQueryBuilder();
        connection = { getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })) };
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
});

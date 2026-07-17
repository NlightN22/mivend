import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';

import { Invoice } from './entities/invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { InvoiceVisibilityService } from './invoice-visibility.service';
import { PaymentListOptions } from './payment-attempt.service';

// Row-level visibility for the manager portal's payment list — a payment is a resource *derived*
// from Invoice (joined via invoiceId), so it reuses InvoiceVisibilityService's scope resolution
// and filter logic rather than duplicating a resolvePaymentScope (see docs/access-control.md's
// "derived resource" rule — same reasoning as documents inheriting counterparty scope).
@Injectable()
export class PaymentVisibilityService {
    constructor(
        private connection: TransactionalConnection,
        private invoiceVisibilityService: InvoiceVisibilityService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options?: PaymentListOptions,
    ): Promise<PaginatedList<PaymentAttempt>> {
        const scope = await this.invoiceVisibilityService.resolveScope(ctx);
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, PaymentAttempt)
            .createQueryBuilder('payment')
            .innerJoin(Invoice, 'invoice', 'invoice.id = payment.invoiceId')
            .leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id::text = invoice.counterpartyId::text',
            );

        if (options?.status) {
            qb.andWhere('payment.paymentStatus = :paymentStatus', {
                paymentStatus: options.status,
            });
        }
        if (options?.channel) {
            qb.andWhere('payment.channel = :channel', { channel: options.channel });
        }
        this.invoiceVisibilityService.applyScope(qb, scope, 'invoice', 'counterparty');

        const [items, totalItems] = await qb
            .orderBy('payment.createdAt', 'DESC')
            .addOrderBy('payment.id', 'DESC')
            .skip(skip)
            .take(take)
            .getManyAndCount();
        return { items, totalItems };
    }
}

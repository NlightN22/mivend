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
        counterpartyId?: string,
    ): Promise<PaginatedList<PaymentAttempt>> {
        const scope = await this.invoiceVisibilityService.resolveScope(ctx);
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, PaymentAttempt)
            .createQueryBuilder('payment')
            // Raw ON-clause strings, not .where()/.andWhere() — TypeORM's alias.property
            // auto-quoting replacement doesn't run here, so camelCase columns must be quoted by
            // hand or Postgres lowercases them to nonexistent columns (real bug, only caught by
            // a live query against real Postgres — see invoice-visibility.service.ts's identical
            // fix).
            .innerJoin(Invoice, 'invoice', 'invoice.id = payment."invoiceId"')
            .leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id::text = invoice."counterpartyId"::text',
            );

        if (counterpartyId) {
            qb.andWhere('invoice.counterpartyId = :counterpartyId', { counterpartyId });
        }
        if (options?.status) {
            qb.andWhere('payment.paymentStatus = :paymentStatus', {
                paymentStatus: options.status,
            });
        }
        if (options?.channel) {
            qb.andWhere('payment.channel = :channel', { channel: options.channel });
        }
        this.invoiceVisibilityService.applyScope(qb, scope, 'invoice', 'counterparty');

        const totalItems = await qb.getCount();
        // getRawAndEntities (not getManyAndCount) — invoice.counterpartyId isn't a PaymentAttempt
        // column, so it only comes back via the raw row; attached below as a transient property
        // so PaymentAttempt.counterpartyId (admin.schema.ts) can resolve it without a second,
        // per-row invoice lookup from the manager-portal Payments list (see api/payments.ts).
        const { entities, raw } = await qb
            .addSelect('invoice.counterpartyId', 'invoice_counterpartyId')
            .orderBy('payment.createdAt', 'DESC')
            .addOrderBy('payment.id', 'DESC')
            .skip(skip)
            .take(take)
            .getRawAndEntities();
        const items = entities.map((item, i) =>
            Object.assign(item, { counterpartyId: String(raw[i].invoice_counterpartyId) }),
        );
        return { items, totalItems };
    }
}

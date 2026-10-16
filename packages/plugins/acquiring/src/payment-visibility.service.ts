import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { documentNumberSearchTerm } from 'shared';
import { Counterparty } from '@mivend/plugin-counterparty';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { ProformaInvoiceVisibilityService } from './proforma-invoice-visibility.service';
import { PaymentListOptions } from './payment-attempt.service';

// Payment inherits visibility from its ProformaInvoice, so reuse that service's scope and filters,
// not a separate resolvePaymentScope (derived-resource rule).
@Injectable()
export class PaymentVisibilityService {
    constructor(
        private connection: TransactionalConnection,
        private proformaInvoiceVisibilityService: ProformaInvoiceVisibilityService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options?: PaymentListOptions,
        counterpartyId?: string,
    ): Promise<PaginatedList<PaymentAttempt>> {
        const scope = await this.proformaInvoiceVisibilityService.resolveScope(ctx);
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, PaymentAttempt)
            .createQueryBuilder('payment')
            // Raw ON-clause string: TypeORM's alias.property auto-quoting doesn't apply here, so quote
            // camelCase columns by hand, or Postgres lowercases them to nonexistent names.
            .innerJoin(
                ProformaInvoice,
                'proformaInvoice',
                'proformaInvoice.id = payment."proformaInvoiceId"',
            )
            .leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id::text = "proformaInvoice"."counterpartyId"::text',
            );

        if (counterpartyId) {
            qb.andWhere('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId });
        }
        if (options?.status) {
            qb.andWhere('payment.paymentStatus = :paymentStatus', {
                paymentStatus: options.status,
            });
        }
        if (options?.channel) {
            qb.andWhere('payment.channel = :channel', { channel: options.channel });
        }
        if (options?.search) {
            qb.andWhere('payment.number ILIKE :search', {
                search: documentNumberSearchTerm(options.search),
            });
        }
        this.proformaInvoiceVisibilityService.applyScope(
            qb,
            scope,
            'proformaInvoice',
            'counterparty',
        );

        const totalItems = await qb.getCount();
        // getRawAndEntities: proformaInvoice.counterpartyId is not a PaymentAttempt column, so it only
        // comes back only in the raw row; attach it as a transient property to avoid per-row lookups.
        const { entities, raw } = await qb
            .addSelect('proformaInvoice.counterpartyId', 'proformaInvoice_counterpartyId')
            .orderBy('payment.createdAt', 'DESC')
            .addOrderBy('payment.id', 'DESC')
            .skip(skip)
            .take(take)
            .getRawAndEntities();
        const items = entities.map((item, i) =>
            Object.assign(item, { counterpartyId: String(raw[i].proformaInvoice_counterpartyId) }),
        );
        return { items, totalItems };
    }
}

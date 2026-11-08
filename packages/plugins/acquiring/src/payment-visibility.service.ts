import { Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { documentNumberSearchTerm } from 'shared';
import { Counterparty } from '@mivend/plugin-counterparty';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { ProformaInvoiceVisibilityService } from './proforma-invoice-visibility.service';
import { PaymentListOptions } from './payment-attempt-query.service';
import { applyListFilter, applyListSort, likeTerm } from './payment-list-query';
import { clampTake } from './list-filter-engine';

const ORDER_CODE_SQL =
    '(SELECT o."code" FROM "order" o WHERE o."id" = COALESCE(payment."orderId", "proformaInvoice"."orderId"))';

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
        const take = clampTake(options?.take);
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
                'counterparty.id = "proformaInvoice"."counterpartyId"',
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
            const search = options.search;
            const term = likeTerm(search);
            qb.andWhere(
                new Brackets(bqb => {
                    bqb.where('payment.number ILIKE :search', {
                        search: documentNumberSearchTerm(search),
                    })
                        .orWhere('counterparty.shortName ILIKE :term', { term })
                        .orWhere('counterparty.legalName ILIKE :term', { term })
                        .orWhere('counterparty.inn ILIKE :term', { term });
                }),
            );
        }
        this.proformaInvoiceVisibilityService.applyScope(
            qb,
            scope,
            'proformaInvoice',
            'counterparty',
        );
        applyListFilter(qb, options?.filter);

        const totalItems = await qb.getCount();
        if (take === 0) return { items: [], totalItems };
        // Joins are to-one, so offset/limit is exact; joined columns come back in the raw row only.
        applyListSort(qb, options?.sort);
        const { entities, raw } = await qb
            .addSelect('proformaInvoice.counterpartyId', 'proformaInvoice_counterpartyId')
            .addSelect('counterparty.shortName', 'counterpartyShortName')
            .addSelect('proformaInvoice.number', 'proformaInvoiceNumber')
            .addSelect(ORDER_CODE_SQL, 'orderCode')
            .offset(skip)
            .limit(take)
            .getRawAndEntities();
        const items = entities.map((item, i) =>
            Object.assign(item, {
                counterpartyId: String(raw[i].proformaInvoice_counterpartyId),
                counterpartyShortName: raw[i].counterpartyShortName ?? null,
                proformaInvoiceNumber: raw[i].proformaInvoiceNumber ?? null,
                orderCode: raw[i].orderCode ?? null,
            }),
        );
        return { items, totalItems };
    }
}

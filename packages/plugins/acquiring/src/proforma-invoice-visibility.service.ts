import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { documentNumberSearchTerm } from 'shared';
import { AccessScopeService, AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { CONTRACT_PAYMENT_KINDS, ProformaInvoice } from './entities/proforma-invoice.entity';
import { applyStatusFilter } from './proforma-invoice-display';
import { ProformaInvoiceListOptions } from './proforma-invoice.service';

// Mirrors erp-order's order visibility; no Customer join needed since counterpartyId is direct.
// branchId is denormalized onto the invoice at issue time, so it is filtered directly.
@Injectable()
export class ProformaInvoiceVisibilityService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options?: ProformaInvoiceListOptions,
        counterpartyId?: string,
    ): Promise<PaginatedList<ProformaInvoice>> {
        const scope = await this.accessScopeService.resolveProformaInvoiceScope(ctx);
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.buildScopedQuery(ctx, scope, options);
        if (counterpartyId) {
            qb.andWhere('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId });
        }
        const [items, totalItems] = await qb
            .orderBy('proformaInvoice.createdAt', 'DESC')
            .addOrderBy('proformaInvoice.id', 'DESC')
            .skip(skip)
            .take(take)
            .getManyAndCount();
        return { items, totalItems };
    }

    // Scoped like findVisible so a department manager cannot probe balances outside their branch.
    // Assumes one currency per counterparty; takes the first currency rather than summing mixed ones.
    async getOutstandingBalance(
        ctx: RequestContext,
        counterpartyId: string,
    ): Promise<{ amount: number; currencyCode: string } | null> {
        const scope = await this.accessScopeService.resolveProformaInvoiceScope(ctx);
        const qb = this.connection
            .getRepository(ctx, ProformaInvoice)
            .createQueryBuilder('proformaInvoice')
            .leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id::text = "proformaInvoice"."counterpartyId"::text',
            )
            .andWhere('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('proformaInvoice.status IN (:...statuses)', {
                statuses: ['pending', 'issued'],
            })
            .andWhere('"proformaInvoice"."kind" NOT IN (:...contractKinds)', {
                contractKinds: CONTRACT_PAYMENT_KINDS,
            });
        this.applyScope(qb, scope);
        const rows = await qb
            .select('proformaInvoice.amount', 'amount')
            .addSelect('proformaInvoice.currencyCode', 'currencyCode')
            .getRawMany<{
                amount: number;
                currencyCode: string;
            }>();
        if (!rows.length) return null;
        return {
            amount: rows.reduce((sum, row) => sum + Number(row.amount), 0),
            currencyCode: rows[0].currencyCode,
        };
    }

    // Shared by PaymentVisibilityService, which joins PaymentAttempt -> ProformaInvoice and needs the
    // exact same counterparty scope resolved/applied to the joined proforma invoice row, not duplicated.
    async resolveScope(ctx: RequestContext): Promise<AccessScope> {
        return this.accessScopeService.resolveProformaInvoiceScope(ctx);
    }

    // Generic over the entity type so PaymentVisibilityService can reuse it on a PaymentAttempt query.
    applyScope<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        scope: AccessScope,
        proformaInvoiceAlias = 'proformaInvoice',
        counterpartyAlias = 'counterparty',
    ): void {
        switch (scope.kind) {
            case 'own':
                // Intentional exception: key account managers read all invoices for their assigned accounts,
                // regardless of which branch serviced the order (see docs/access-control.md).
                this.accessScopeService.applyOwnCounterpartyFilter(qb, counterpartyAlias, scope);
                break;
            case 'department': {
                // The invoice's own branchId, never departmentId; plus own and granted managers' clients (#123).
                const managers = this.accessScopeService.managerClause(scope, counterpartyAlias);
                qb.andWhere(
                    `(${proformaInvoiceAlias}.branchId = :branchId${managers ? ` OR ${managers.sql}` : ''})`,
                    { branchId: scope.branchId ?? null, ...managers?.params },
                );
                break;
            }
            case 'all':
                break;
        }
    }

    private buildScopedQuery(
        ctx: RequestContext,
        scope: AccessScope,
        options?: ProformaInvoiceListOptions,
    ): SelectQueryBuilder<ProformaInvoice> {
        const qb = this.connection
            .getRepository(ctx, ProformaInvoice)
            .createQueryBuilder('proformaInvoice')
            .leftJoin(
                Counterparty,
                'counterparty',
                // Raw ON-clause: TypeORM only auto-quotes alias.property inside where clauses, not here.
                // Quote the camelCase alias and column by hand, or Postgres lowercases them and the query fails.
                'counterparty.id::text = "proformaInvoice"."counterpartyId"::text',
            );
        if (options?.status) {
            applyStatusFilter(qb, 'proformaInvoice', options.status);
        }
        if (options?.search) {
            qb.andWhere('proformaInvoice.number ILIKE :search', {
                search: documentNumberSearchTerm(options.search),
            });
        }
        this.applyScope(qb, scope);
        return qb;
    }
}

import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService, AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { Invoice } from './entities/invoice.entity';
import { InvoiceListOptions } from './invoice.service';

// Row-level visibility for the manager portal's invoice list — mirrors
// packages/plugins/erp-order/src/order-visibility.service.ts. Invoice already carries
// counterpartyId directly (no join-through-Customer needed like Order does), and its own
// denormalized branchId (set at creation time — see InvoiceService.createInvoicesForOrder).
@Injectable()
export class InvoiceVisibilityService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options?: InvoiceListOptions,
        counterpartyId?: string,
    ): Promise<PaginatedList<Invoice>> {
        const scope = await this.accessScopeService.resolveInvoiceScope(ctx);
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.buildScopedQuery(ctx, scope, options);
        if (counterpartyId) {
            qb.andWhere('invoice.counterpartyId = :counterpartyId', { counterpartyId });
        }
        const [items, totalItems] = await qb
            .orderBy('invoice.createdAt', 'DESC')
            .addOrderBy('invoice.id', 'DESC')
            .skip(skip)
            .take(take)
            .getManyAndCount();
        return { items, totalItems };
    }

    // Real aggregate for the Customer detail page's "Outstanding balance" KPI — sums unpaid
    // invoices (pending/issued) for one counterparty, scoped the same way findVisible is so a
    // department-scoped manager can't probe balances outside their own branch. Assumes one
    // currency per counterparty (true for this project's current single-currency-per-org model);
    // returns the first currency encountered if that assumption is ever violated, rather than
    // silently summing across currencies.
    async getOutstandingBalance(
        ctx: RequestContext,
        counterpartyId: string,
    ): Promise<{ amount: number; currencyCode: string } | null> {
        const scope = await this.accessScopeService.resolveInvoiceScope(ctx);
        const qb = this.connection
            .getRepository(ctx, Invoice)
            .createQueryBuilder('invoice')
            .leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id::text = invoice."counterpartyId"::text',
            )
            .andWhere('invoice.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('invoice.status IN (:...statuses)', { statuses: ['pending', 'issued'] });
        this.applyScope(qb, scope);
        const rows = await qb
            .select('invoice.amount', 'amount')
            .addSelect('invoice.currencyCode', 'currencyCode')
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

    // Shared by PaymentVisibilityService, which joins PaymentAttempt -> Invoice and needs the
    // exact same counterparty scope resolved/applied to the joined invoice row, not duplicated.
    async resolveScope(ctx: RequestContext): Promise<AccessScope> {
        return this.accessScopeService.resolveInvoiceScope(ctx);
    }

    // Generic over the query builder's entity type so PaymentVisibilityService can reuse this
    // against its own PaymentAttempt-rooted query (joined to the same aliased invoice/
    // counterparty rows) without a cast.
    applyScope<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        scope: AccessScope,
        invoiceAlias = 'invoice',
        counterpartyAlias = 'counterparty',
    ): void {
        switch (scope.kind) {
            case 'own':
                // No branch restriction — key-account-manager read exception (see
                // docs/access-control.md): a manager sees every invoice for their own assigned
                // accounts regardless of which branch actually serviced the underlying order.
                this.accessScopeService.applyOwnCounterpartyFilter(
                    qb,
                    counterpartyAlias,
                    scope.administratorId,
                );
                break;
            case 'department':
                // Filtered by the invoice's own denormalized branch, not Counterparty.branchId
                // (a chain account's "home" branch and the branch actually servicing a given
                // invoice can differ) — see docs/access-control.md.
                qb.andWhere(
                    `${counterpartyAlias}.departmentId = :departmentId AND ${invoiceAlias}.branchId = :branchId`,
                    { departmentId: scope.departmentId ?? null, branchId: scope.branchId ?? null },
                );
                break;
            case 'all':
                break;
        }
    }

    private buildScopedQuery(
        ctx: RequestContext,
        scope: AccessScope,
        options?: InvoiceListOptions,
    ): SelectQueryBuilder<Invoice> {
        const qb = this.connection
            .getRepository(ctx, Invoice)
            .createQueryBuilder('invoice')
            .leftJoin(
                Counterparty,
                'counterparty',
                // Raw ON-clause string, not .where()/.andWhere() — TypeORM's alias.property
                // auto-quoting replacement doesn't run here (only inside actual where clauses),
                // so the camelCase column must be quoted by hand or Postgres lowercases it to
                // the nonexistent "counterpartyid" (real bug, caught by a live query — the mock-
                // based unit tests for this service never exercise real SQL).
                'counterparty.id::text = invoice."counterpartyId"::text',
            );
        if (options?.status) {
            qb.andWhere('invoice.status = :status', { status: options.status });
        }
        if (options?.search) {
            // Substring match against the invoice's own numeric id (cast to text) — see
            // InvoiceListOptions.search's own doc comment (invoice.service.ts) for why this,
            // not a real document-number field, is what "search invoices" means today.
            qb.andWhere('CAST(invoice.id AS text) ILIKE :search', {
                search: `%${options.search}%`,
            });
        }
        this.applyScope(qb, scope);
        return qb;
    }
}

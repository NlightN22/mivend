import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { documentNumberSearchTerm } from 'shared';
import { AccessScopeService, AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { applyStatusFilter } from './proforma-invoice-display';
import { ProformaInvoiceListOptions } from './proforma-invoice.service';

// Row-level visibility for the manager portal's proforma invoice list — mirrors
// packages/plugins/erp-order/src/order-visibility.service.ts. ProformaInvoice already carries
// counterpartyId directly (no join-through-Customer needed like Order does), and its own
// denormalized branchId (set at creation time — see ProformaInvoiceIssuingService.issueForOrder).
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

    // Real aggregate for the Customer detail page's "Outstanding balance" KPI — sums unpaid
    // proforma invoices (pending/issued) for one counterparty, scoped the same way findVisible is so a
    // department-scoped manager can't probe balances outside their own branch. Assumes one
    // currency per counterparty (true for this project's current single-currency-per-org model);
    // returns the first currency encountered if that assumption is ever violated, rather than
    // silently summing across currencies.
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
                'counterparty.id::text = proformaInvoice."counterpartyId"::text',
            )
            .andWhere('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('proformaInvoice.status IN (:...statuses)', {
                statuses: ['pending', 'issued'],
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

    // Generic over the query builder's entity type so PaymentVisibilityService can reuse this
    // against its own PaymentAttempt-rooted query (joined to the same aliased proforma invoice/
    // counterparty rows) without a cast.
    applyScope<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        scope: AccessScope,
        proformaInvoiceAlias = 'proformaInvoice',
        counterpartyAlias = 'counterparty',
    ): void {
        switch (scope.kind) {
            case 'own':
                // No branch restriction — key-account-manager read exception (see
                // docs/access-control.md): a manager sees every proforma invoice for their own assigned
                // accounts regardless of which branch actually serviced the underlying order.
                this.accessScopeService.applyOwnCounterpartyFilter(
                    qb,
                    counterpartyAlias,
                    scope.administratorId,
                );
                break;
            case 'department':
                // Filtered by the proforma invoice's own denormalized branch, not Counterparty.branchId
                // (a chain account's "home" branch and the branch actually servicing a given
                // proforma invoice can differ) — see docs/access-control.md. `departmentId` is
                // deliberately never compared — Department (ERP org data) is pure display
                // information, never an access-scope gate; only Branch (mivend's own entity) is
                // (2026-09-20 correction, see docs/access-control.md).
                qb.andWhere(`${proformaInvoiceAlias}.branchId = :branchId`, {
                    branchId: scope.branchId ?? null,
                });
                break;
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
                // Raw ON-clause string, not .where()/.andWhere() — TypeORM's alias.property
                // auto-quoting replacement doesn't run here (only inside actual where clauses),
                // so the camelCase column must be quoted by hand or Postgres lowercases it to
                // the nonexistent "counterpartyid" (real bug, caught by a live query — the mock-
                // based unit tests for this service never exercise real SQL).
                'counterparty.id::text = proformaInvoice."counterpartyId"::text',
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

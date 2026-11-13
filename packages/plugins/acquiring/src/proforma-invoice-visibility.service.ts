import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { clampSkip, clampTake, documentNumberSearchTerm, normalizeDocumentNumber } from 'shared';
import {
    AccessScopeService,
    AccessScope,
    BranchSettingsService,
} from '@mivend/plugin-access-control';
import { proformaBranchClause } from '@mivend/plugin-erp-order';
import { Counterparty } from '@mivend/plugin-counterparty';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { CONTRACT_PAYMENT_KINDS, ProformaInvoice } from './entities/proforma-invoice.entity';
import { applyStatusFilter } from './proforma-invoice-display';
import { ProformaInvoiceListOptions } from './proforma-invoice.service';
import { applyListFilter, applyListSort, likeTerm } from './proforma-invoice-list-query';

// Mirrors erp-order's order visibility; no Customer join needed since counterpartyId is direct.
export type ProformaInvoiceScope = AccessScope & { defaultBranchId: string | null };

@Injectable()
export class ProformaInvoiceVisibilityService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
        private branchSettingsService: BranchSettingsService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options?: ProformaInvoiceListOptions,
        counterpartyId?: string,
    ): Promise<PaginatedList<ProformaInvoice>> {
        const scope = await this.resolveScope(ctx);
        const take = clampTake(options?.take);
        const skip = clampSkip(options?.skip);

        const qb = this.buildScopedQuery(ctx, scope, options);
        if (counterpartyId) {
            qb.andWhere('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId });
        }
        const countRow = await qb
            .clone()
            .select('COUNT(*)', 'total')
            .getRawOne<{ total: string }>();
        if (take === 0) return { items: [], totalItems: Number(countRow?.total ?? 0) };
        // Joins are to-one, so offset/limit is exact. `lines` is never read by the list, so it is not selected.
        applyListSort(qb, options?.sort);
        const { entities, raw } = await qb
            .select(this.listColumns(ctx))
            .addSelect('counterparty.shortName', 'counterpartyShortName')
            .offset(skip)
            .limit(take)
            .getRawAndEntities<{ counterpartyShortName: string | null }>();
        entities.forEach((item, i) => {
            item.counterpartyShortName = raw[i]?.counterpartyShortName ?? null;
        });
        return { items: entities, totalItems: Number(countRow?.total ?? 0) };
    }

    // Same scope as the list, matching the number only (global search); newest first.
    async searchByNumber(
        ctx: RequestContext,
        term: string,
        limit: number,
    ): Promise<Array<ProformaInvoice & { counterpartyShortName: string | null }>> {
        const scope = await this.resolveScope(ctx);
        const { entities, raw } = await this.buildScopedQuery(ctx, scope)
            .andWhere('proformaInvoice.number ILIKE :gsTerm', {
                gsTerm: likeTerm(normalizeDocumentNumber(term)),
            })
            .select(['proformaInvoice.id', 'proformaInvoice.number', 'proformaInvoice.status'])
            .addSelect('counterparty.shortName', 'counterpartyShortName')
            .addSelect('"proformaInvoice"."counterpartyId"', 'counterpartyId')
            .orderBy('proformaInvoice.id', 'DESC')
            .limit(limit)
            .getRawAndEntities<{ counterpartyShortName: string | null; counterpartyId: number }>();
        return entities.map((item, i) =>
            Object.assign(item, {
                counterpartyShortName: raw[i]?.counterpartyShortName ?? null,
                counterpartyId: raw[i]?.counterpartyId,
            }),
        );
    }

    // Same scope as the list; an unknown and a hidden id are both null.
    async findOneVisible(ctx: RequestContext, id: string): Promise<ProformaInvoice | null> {
        if (!/^\d{1,9}$/.test(id)) return null;
        const scope = await this.resolveScope(ctx);
        const { entities, raw } = await this.buildScopedQuery(ctx, scope)
            .andWhere('proformaInvoice.id = :id', { id: Number(id) })
            .addSelect('counterparty.shortName', 'counterpartyShortName')
            .limit(1)
            .getRawAndEntities<{ counterpartyShortName: string | null }>();
        const found = entities[0];
        if (!found) return null;
        found.counterpartyShortName = raw[0]?.counterpartyShortName ?? null;
        return found;
    }

    private listColumns(ctx: RequestContext): string[] {
        return this.connection
            .getRepository(ctx, ProformaInvoice)
            .metadata.columns.filter(column => column.propertyName !== 'lines')
            .map(column => `proformaInvoice.${column.propertyName}`);
    }

    // Scoped like findVisible so a department manager cannot probe balances outside their branch.
    // Assumes one currency per counterparty; mixed currencies report the alphabetically smallest code (MIN), deterministically.
    async getOutstandingBalance(
        ctx: RequestContext,
        counterpartyId: string,
    ): Promise<{ amount: number; currencyCode: string } | null> {
        const scope = await this.resolveScope(ctx);
        const qb = this.connection
            .getRepository(ctx, ProformaInvoice)
            .createQueryBuilder('proformaInvoice')
            .leftJoin(
                Counterparty,
                'counterparty',
                'counterparty.id = "proformaInvoice"."counterpartyId"',
            )
            .andWhere('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('proformaInvoice.status IN (:...statuses)', {
                statuses: ['pending', 'issued'],
            })
            .andWhere('"proformaInvoice"."kind" NOT IN (:...contractKinds)', {
                contractKinds: CONTRACT_PAYMENT_KINDS,
            });
        this.applyScope(qb, scope);
        const row = await qb
            .select('COUNT(*)', 'count')
            .addSelect('SUM(proformaInvoice.amount)', 'amount')
            .addSelect('MIN(proformaInvoice.currencyCode)', 'currencyCode')
            .getRawOne<{ count: string; amount: string | null; currencyCode: string }>();
        if (!row || Number(row.count) === 0) return null;
        return { amount: Number(row.amount), currencyCode: row.currencyCode };
    }

    // Shared by PaymentVisibilityService, which joins PaymentAttempt -> ProformaInvoice and needs the
    // exact same counterparty scope resolved/applied to the joined proforma invoice row, not duplicated.
    async resolveScope(ctx: RequestContext): Promise<ProformaInvoiceScope> {
        const scope = await this.accessScopeService.resolveProformaInvoiceScope(ctx);
        const defaultBranchId =
            scope.kind === 'department'
                ? await this.branchSettingsService.getGlobalDefaultBranchId(ctx)
                : null;
        return { ...scope, defaultBranchId };
    }

    // Generic over the entity type so PaymentVisibilityService can reuse it on a PaymentAttempt query.
    applyScope<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        scope: ProformaInvoiceScope,
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
                // Read-time branch, never the issue-time snapshot (#263); plus own and granted managers' clients.
                const tradingPointAlias = this.joinBranchSource(qb, proformaInvoiceAlias);
                const branch = proformaBranchClause(
                    tradingPointAlias,
                    counterpartyAlias,
                    scope.branchId ?? null,
                    scope.defaultBranchId,
                );
                const managers = this.accessScopeService.managerClause(scope, counterpartyAlias);
                qb.andWhere(`(${branch.sql}${managers ? ` OR ${managers.sql}` : ''})`, {
                    ...branch.params,
                    ...managers?.params,
                });
                break;
            }
            case 'all':
                break;
        }
    }

    // Left-joins order -> trading point (both to-one, indexed by primary key) once instead of correlated subqueries per row.
    private joinBranchSource<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        proformaAlias: string,
    ): string {
        const orderAlias = `${proformaAlias}Order`;
        const tradingPointAlias = `${proformaAlias}TradingPoint`;
        // Table names, not entities: the order table belongs to Vendure core and trading_point to another plugin.
        qb.leftJoin(
            'order',
            orderAlias,
            `"${orderAlias}".id = "${proformaAlias}"."orderId"`,
        ).leftJoin(
            'trading_point',
            tradingPointAlias,
            `"${tradingPointAlias}".id::text = "${orderAlias}"."customFieldsTradingpointid"`,
        );
        return tradingPointAlias;
    }

    private buildScopedQuery(
        ctx: RequestContext,
        scope: ProformaInvoiceScope,
        options?: ProformaInvoiceListOptions,
    ): SelectQueryBuilder<ProformaInvoice> {
        const qb = this.connection
            .getRepository(ctx, ProformaInvoice)
            .createQueryBuilder('proformaInvoice')
            .leftJoin(
                Counterparty,
                'counterparty',
                // Raw ON-clause: quote the camelCase alias and column by hand, or Postgres lowercases them.
                'counterparty.id = "proformaInvoice"."counterpartyId"',
            );
        if (options?.status) {
            applyStatusFilter(qb, 'proformaInvoice', options.status);
        }
        if (options?.search) {
            const search = options.search;
            const term = likeTerm(search);
            qb.andWhere(
                new Brackets(bqb => {
                    bqb.where('proformaInvoice.number ILIKE :search', {
                        search: documentNumberSearchTerm(search),
                    })
                        .orWhere('counterparty.shortName ILIKE :term', { term })
                        .orWhere('counterparty.legalName ILIKE :term', { term })
                        .orWhere('counterparty.inn ILIKE :term', { term });
                }),
            );
        }
        this.applyScope(qb, scope);
        applyListFilter(qb, options?.filter);
        return qb;
    }
}

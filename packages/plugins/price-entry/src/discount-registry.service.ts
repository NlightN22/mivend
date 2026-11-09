import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets, In, WhereExpressionBuilder } from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';
import { clampSkip, clampTake, getPageAndCount, likeTerm, normalizeDocumentNumber, withAggregateLock } from 'shared';

import { DiscountRegistryEntry } from './discount-registry-entry.entity';
import {
    EXPIRING_SOON_DAYS,
    REGISTRY_STATUS_SQL,
    applyListFilter,
    applyListSort,
    type DiscountRegistryFilter,
    type DiscountRegistrySort,
} from './discount-registry-list-query';

export { EXPIRING_SOON_DAYS };

export type DiscountRegistryFilterStatus =
    | 'active'
    | 'expiring-soon'
    | 'expired'
    | 'pending'
    | 'rejected';

export interface DiscountRegistryListOptions {
    take?: number;
    skip?: number;
    search?: string;
    priceTypeCode?: string;
    // Set by the resolver from PriceTypeAccessService; never a client argument.
    allowedPriceTypeCodes?: string[];
    status?: DiscountRegistryFilterStatus;
    filter?: DiscountRegistryFilter;
    sort?: DiscountRegistrySort;
}

export interface DiscountRegistryEntryInput {
    approvalRequestId: ID;
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: Date;
    validTo: Date;
    justification: string | null;
    counterpartyIds: string[] | null;
}

export interface DiscountRuleForRegistry {
    id: ID;
    // Promo-type rules have no priceTypeCode (see DiscountRule.priceTypeCode's own comment) —
    // upsertFromRule coerces to the registry entry's own non-null column.
    priceTypeCode: string | null;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: Date;
    validTo: Date;
}

// The only file in the codebase allowed to touch DiscountRegistryEntry directly (see the backend-plugin-rules skill's
// "Pagination" section — read-model/projection tables). Every other file goes through these methods.
@Injectable()
export class DiscountRegistryService {
    constructor(
        private connection: TransactionalConnection,
        private numberingService: NumberingService,
    ) {}

    // The number the request was filed under; the materialized grant reuses it. Null before the registry existed.
    async numberFor(ctx: RequestContext, approvalRequestId: ID): Promise<string | null> {
        const entry = await this.connection
            .getRepository(ctx, DiscountRegistryEntry)
            .findOne({ where: { approvalRequestId: String(approvalRequestId) } });
        return entry?.number ?? null;
    }

    private async resolveCustomerNamesForSearch(
        ctx: RequestContext,
        counterpartyIds: string[] | null,
    ): Promise<string | null> {
        if (!counterpartyIds || counterpartyIds.length === 0) return null;
        const counterparties = await this.connection
            .getRepository(ctx, Counterparty)
            .findBy({ id: In(counterpartyIds) });
        return counterparties.map(c => c.legalName).join(', ') || null;
    }

    // Called by DiscountGrantService.requestGrant, right after the ApprovalRequest is created —
    // the registry entry starts its life as 'pending'.
    async createFromRequest(ctx: RequestContext, input: DiscountRegistryEntryInput): Promise<void> {
        const repo = this.connection.getRepository(ctx, DiscountRegistryEntry);
        const entry = repo.create({
            number: await this.numberingService.next(ctx, 'discount-grant'),
            approvalRequestId: String(input.approvalRequestId),
            discountRuleId: null,
            status: 'pending' as const,
            priceTypeCode: input.priceTypeCode,
            facetCode: input.facetCode,
            facetValueCode: input.facetValueCode,
            percent: input.percent,
            validFrom: input.validFrom,
            validTo: input.validTo,
            justification: input.justification,
            counterpartyIds: input.counterpartyIds,
            customerNamesForSearch: await this.resolveCustomerNamesForSearch(
                ctx,
                input.counterpartyIds,
            ),
        });
        await repo.save(entry);
    }

    // No ApprovalRequest exists for ERP-pushed rules, so they go straight to 'materialized'.
    // Callers must skip portal-origin rules (erpId portal-<requestId>); their entry already exists.
    async upsertFromRule(ctx: RequestContext, rule: DiscountRuleForRegistry): Promise<void> {
        await withAggregateLock(
            this.connection,
            ctx,
            `discount-registry-rule:${String(rule.id)}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, DiscountRegistryEntry);
                let entry = await repo.findOne({ where: { discountRuleId: String(rule.id) } });
                if (!entry) {
                    entry = repo.create({
                        number: await this.numberingService.next(txCtx, 'discount-grant'),
                        discountRuleId: String(rule.id),
                        approvalRequestId: null,
                    });
                }
                entry.status = 'materialized';
                entry.priceTypeCode = rule.priceTypeCode ?? '';
                entry.facetCode = rule.facetCode;
                entry.facetValueCode = rule.facetValueCode;
                entry.percent = rule.percent;
                entry.validFrom = rule.validFrom;
                entry.validTo = rule.validTo;
                await repo.save(entry);
            },
        );
    }

    // An entry is reachable by its request id and its rule id; take both keys in alphabetical order so writers never interleave.
    private async withEntryLocks(
        ctx: RequestContext,
        approvalRequestId: ID | null,
        discountRuleId: ID | null,
        work: (txCtx: RequestContext) => Promise<void>,
    ): Promise<void> {
        const keys: string[] = [];
        if (approvalRequestId) keys.push(`discount-registry-request:${String(approvalRequestId)}`);
        if (discountRuleId) keys.push(`discount-registry-rule:${String(discountRuleId)}`);
        const run = keys
            .sort()
            .reduceRight<
                (txCtx: RequestContext) => Promise<void>
            >((inner, key) => c => withAggregateLock(this.connection, c, key, inner), work);
        await run(ctx);
    }

    // Rejected entries are final; approved ones become 'materialized' and validTo drives their status.
    async markDecided(
        ctx: RequestContext,
        approvalRequestId: ID,
        outcome: 'materialized' | 'rejected',
        discountRuleId?: ID,
    ): Promise<void> {
        await this.withEntryLocks(
            ctx,
            approvalRequestId,
            outcome === 'materialized' ? (discountRuleId ?? null) : null,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, DiscountRegistryEntry);
                const entry = await repo.findOne({
                    where: { approvalRequestId: String(approvalRequestId) },
                });
                if (!entry) return; // predates the registry (backfilled separately) or never created
                entry.status = outcome;
                if (discountRuleId !== undefined) entry.discountRuleId = String(discountRuleId);
                await repo.save(entry);
            },
        );
    }

    async findAllPaginated(
        ctx: RequestContext,
        options: DiscountRegistryListOptions = {},
    ): Promise<PaginatedList<DiscountRegistryEntry>> {
        const take = clampTake(options.take);
        const qb = this.connection
            .getRepository(ctx, DiscountRegistryEntry)
            .createQueryBuilder('entry');

        if (options.allowedPriceTypeCodes) {
            qb.andWhere('entry.priceTypeCode IN (:...allowedPriceTypeCodes)', {
                allowedPriceTypeCodes: options.allowedPriceTypeCodes.length
                    ? options.allowedPriceTypeCodes
                    : [''],
            });
        }
        if (options.priceTypeCode) {
            qb.andWhere('entry.priceTypeCode = :priceTypeCode', {
                priceTypeCode: options.priceTypeCode,
            });
        }
        if (options.status) {
            qb.andWhere(`${REGISTRY_STATUS_SQL} = :statusView`, { statusView: options.status });
        }
        if (options.search) {
            const term = likeTerm(options.search);
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('entry.number ILIKE :numberTerm', {
                        numberTerm: likeTerm(normalizeDocumentNumber(options.search as string)),
                    })
                        .orWhere('entry.priceTypeCode ILIKE :term', { term })
                        .orWhere('entry.facetValueCode ILIKE :term', { term })
                        .orWhere('entry.facetCode ILIKE :term', { term })
                        .orWhere('entry.customerNamesForSearch ILIKE :term', { term });
                }),
            );
        }
        applyListFilter(qb, options.filter);

        return getPageAndCount(qb, take, clampSkip(options.skip), (q) => applyListSort(q, options.sort));
    }

    // Counts only — powers the /discounts KPI cards without fetching rows.
    async countByStatus(
        ctx: RequestContext,
        status: DiscountRegistryFilterStatus,
    ): Promise<number> {
        const { totalItems } = await this.findAllPaginated(ctx, { take: 0, status });
        return totalItems;
    }

    // Idempotent: upserts by approvalRequestId when set, otherwise by discountRuleId, so reruns are safe.
    async backfill(
        ctx: RequestContext,
        entries: Array<{
            approvalRequestId: ID | null;
            discountRuleId: ID | null;
            status: 'pending' | 'rejected' | 'materialized';
            input: Omit<DiscountRegistryEntryInput, 'approvalRequestId'>;
        }>,
    ): Promise<number> {
        let written = 0;
        for (const item of entries) {
            await this.withEntryLocks(ctx, item.approvalRequestId, item.discountRuleId, txCtx =>
                this.backfillOne(txCtx, item),
            );
            written++;
        }
        return written;
    }

    private async backfillOne(
        ctx: RequestContext,
        item: {
            approvalRequestId: ID | null;
            discountRuleId: ID | null;
            status: 'pending' | 'rejected' | 'materialized';
            input: Omit<DiscountRegistryEntryInput, 'approvalRequestId'>;
        },
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, DiscountRegistryEntry);
        const lookupKey = item.approvalRequestId
            ? { approvalRequestId: String(item.approvalRequestId) }
            : { discountRuleId: String(item.discountRuleId) };
        const existing = await repo.findOne({ where: lookupKey });
        const customerNamesForSearch = await this.resolveCustomerNamesForSearch(
            ctx,
            item.input.counterpartyIds,
        );
        const fields = {
            approvalRequestId: item.approvalRequestId ? String(item.approvalRequestId) : null,
            discountRuleId: item.discountRuleId ? String(item.discountRuleId) : null,
            status: item.status,
            priceTypeCode: item.input.priceTypeCode,
            facetCode: item.input.facetCode,
            facetValueCode: item.input.facetValueCode,
            percent: item.input.percent,
            validFrom: item.input.validFrom,
            validTo: item.input.validTo,
            justification: item.input.justification,
            counterpartyIds: item.input.counterpartyIds,
            customerNamesForSearch,
        };
        if (existing) {
            Object.assign(existing, fields);
            await repo.save(existing);
        } else {
            const number = await this.numberingService.next(ctx, 'discount-grant');
            await repo.save(repo.create({ ...fields, number }));
        }
    }
}

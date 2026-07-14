import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets, In, WhereExpressionBuilder } from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';

import { DiscountRegistryEntry } from './discount-registry-entry.entity';

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
    status?: DiscountRegistryFilterStatus;
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
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: Date;
    validTo: Date;
}

const EXPIRING_SOON_DAYS = 14;

// The only file in the codebase allowed to touch DiscountRegistryEntry directly (see AGENTS.md
// "Pagination" — read-model/projection tables). Every other file goes through these methods.
@Injectable()
export class DiscountRegistryService {
    constructor(private connection: TransactionalConnection) {}

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

    // Called by DiscountRuleService.upsert/bulkUpsert for rules that were never approval-driven
    // (ERP-pushed via bulkUpsertDiscountRules / upsertDiscountRule) — these have no
    // ApprovalRequest at all, so they go straight to 'materialized' with no approvalRequestId.
    // Portal-origin rules (erpId `portal-<requestId>`) must NOT go through this path — their
    // registry entry already exists from createFromRequest/markDecided; the caller is
    // responsible for skipping those (see DiscountRuleService).
    async upsertFromRule(ctx: RequestContext, rule: DiscountRuleForRegistry): Promise<void> {
        const repo = this.connection.getRepository(ctx, DiscountRegistryEntry);
        let entry = await repo.findOne({ where: { discountRuleId: String(rule.id) } });
        if (!entry) {
            entry = repo.create({ discountRuleId: String(rule.id), approvalRequestId: null });
        }
        entry.status = 'materialized';
        entry.priceTypeCode = rule.priceTypeCode;
        entry.facetCode = rule.facetCode;
        entry.facetValueCode = rule.facetValueCode;
        entry.percent = rule.percent;
        entry.validFrom = rule.validFrom;
        entry.validTo = rule.validTo;
        await repo.save(entry);
    }

    // Called by DiscountGrantService.decideAndApply once a decision lands — approved entries
    // transition to 'materialized' (validTo-driven active/expiring/expired classification takes
    // over from here); rejected entries are a final state.
    async markDecided(
        ctx: RequestContext,
        approvalRequestId: ID,
        outcome: 'materialized' | 'rejected',
        discountRuleId?: ID,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, DiscountRegistryEntry);
        const entry = await repo.findOne({
            where: { approvalRequestId: String(approvalRequestId) },
        });
        if (!entry) return; // entry predates the registry (backfilled separately) or was never created
        entry.status = outcome;
        if (discountRuleId !== undefined) entry.discountRuleId = String(discountRuleId);
        await repo.save(entry);
    }

    async findAllPaginated(
        ctx: RequestContext,
        options: DiscountRegistryListOptions = {},
    ): Promise<PaginatedList<DiscountRegistryEntry>> {
        const qb = this.connection
            .getRepository(ctx, DiscountRegistryEntry)
            .createQueryBuilder('entry');

        if (options.priceTypeCode) {
            qb.andWhere('entry.priceTypeCode = :priceTypeCode', {
                priceTypeCode: options.priceTypeCode,
            });
        }

        if (options.status === 'pending' || options.status === 'rejected') {
            qb.andWhere('entry.status = :status', { status: options.status });
        } else if (options.status) {
            const now = new Date();
            const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
            qb.andWhere('entry.status = :materialized', { materialized: 'materialized' });
            if (options.status === 'expired') {
                qb.andWhere('entry.validTo < :now', { now });
            } else if (options.status === 'expiring-soon') {
                qb.andWhere('entry.validTo >= :now AND entry.validTo < :soon', { now, soon });
            } else {
                qb.andWhere('entry.validTo >= :soon', { soon });
            }
        }

        if (options.search) {
            const term = `%${options.search}%`;
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('entry.priceTypeCode ILIKE :term', { term })
                        .orWhere('entry.facetValueCode ILIKE :term', { term })
                        .orWhere('entry.facetCode ILIKE :term', { term })
                        .orWhere('entry.customerNamesForSearch ILIKE :term', { term });
                }),
            );
        }

        qb.orderBy('entry.validTo', 'DESC')
            .take(options.take ?? 20)
            .skip(options.skip ?? 0);

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // Counts only — powers the /discounts KPI cards without fetching rows.
    async countByStatus(
        ctx: RequestContext,
        status: DiscountRegistryFilterStatus,
    ): Promise<number> {
        const { totalItems } = await this.findAllPaginated(ctx, { take: 0, status });
        return totalItems;
    }

    // One-off backfill for DiscountRule/ApprovalRequest rows that existed before this table did.
    // Idempotent (upserts by approvalRequestId if set, else by discountRuleId) — safe to call
    // more than once. See `backfillDiscountRegistry` admin mutation.
    async backfill(
        ctx: RequestContext,
        entries: Array<{
            approvalRequestId: ID | null;
            discountRuleId: ID | null;
            status: 'pending' | 'rejected' | 'materialized';
            input: Omit<DiscountRegistryEntryInput, 'approvalRequestId'>;
        }>,
    ): Promise<number> {
        const repo = this.connection.getRepository(ctx, DiscountRegistryEntry);
        let written = 0;
        for (const item of entries) {
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
                await repo.save(repo.create(fields));
            }
            written++;
        }
        return written;
    }
}

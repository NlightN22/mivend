import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    CustomerService,
    EventBus,
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { withAggregateLock } from 'shared';

import { applyCounterpartyListFilter, CounterpartyListFilter } from './counterparty-list-filter';
import { CounterpartyCreatedEvent } from './counterparty-created.event';
import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyErpDetails, definedErpDetails } from './counterparty-erp-details';
import { CounterpartySortParameter, CounterpartyUpsertPayload, loggerCtx } from './types';

// Column name must come from a whitelist of CounterpartySortParameter fields, never caller input
// Today only GraphQL-validated enum keys arrive, but the whitelist must hold regardless
const SORTABLE_COLUMNS: Record<keyof CounterpartySortParameter, string> = {
    shortName: 'c.shortName',
    inn: 'c.inn',
    managerErpId: 'c.managerErpId',
    phone: 'c.phone',
    officialEmail: 'c.officialEmail',
};

interface ActiveStateFields extends CounterpartyErpDetails {
    name: string | null;
    isActive: boolean;
    inn?: string | null;
    erpGroupLabel?: string | null;
    departmentId?: string | null;
    assignedManagerId?: string | null;
    // Raw erpId assignedManagerId was resolved from; always passed alongside it, even when that is null
    managerErpId?: string | null;
    legalAddress?: string | null;
    factualAddress?: string | null;
    phone?: string | null;
    officialEmail?: string | null;
}

@Injectable()
export class CounterpartyService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private customerPricingService: CustomerPricingService,
        private accessScopeService: AccessScopeService,
        private eventBus: EventBus,
    ) {}

    // Find-then-write per erpId runs under an advisory lock so parallel inbox events cannot both insert.
    async upsert(ctx: RequestContext, payload: CounterpartyUpsertPayload): Promise<Counterparty> {
        return withAggregateLock(
            this.connection,
            ctx,
            `counterparty:${payload.erpId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, Counterparty);
                let record = await repo.findOne({ where: { erpId: payload.erpId } });
                const isNew = !record;
                if (record) {
                    Object.assign(record, payload);
                } else {
                    record = repo.create(payload);
                }
                const saved = await repo.save(record);
                if (isNew) this.publishCreated(txCtx, saved);
                Logger.verbose(`Upserted counterparty erpId=${payload.erpId}`, loggerCtx);
                return saved;
            },
        );
    }

    // Never reuse upsert() here: the stream omits creditLimit/paymentDelayDays/priceType/branchId
    // Tombstone (name null) only updates isActive, never creates a row. undefined = keep, null = clear.
    async upsertActiveState(
        ctx: RequestContext,
        erpId: string,
        fields: ActiveStateFields,
    ): Promise<boolean> {
        return withAggregateLock(this.connection, ctx, `counterparty:${erpId}`, txCtx =>
            this.applyActiveState(txCtx, erpId, fields),
        );
    }

    private async applyActiveState(
        ctx: RequestContext,
        erpId: string,
        fields: ActiveStateFields,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const entity = await repo.findOne({ where: { erpId } });
        if (entity) {
            if (fields.name) {
                entity.legalName = fields.name;
                entity.shortName = fields.name;
            }
            entity.isActive = fields.isActive;
            if (fields.inn !== undefined) entity.inn = fields.inn;
            if (fields.erpGroupLabel !== undefined) entity.erpGroupLabel = fields.erpGroupLabel;
            if (fields.departmentId !== undefined) entity.departmentId = fields.departmentId;
            if (fields.assignedManagerId !== undefined) {
                entity.assignedManagerId = fields.assignedManagerId;
            }
            if (fields.managerErpId !== undefined) entity.managerErpId = fields.managerErpId;
            if (fields.legalAddress !== undefined) entity.legalAddress = fields.legalAddress;
            if (fields.factualAddress !== undefined) {
                entity.factualAddress = fields.factualAddress;
            }
            if (fields.phone !== undefined) entity.phone = fields.phone;
            if (fields.officialEmail !== undefined) entity.officialEmail = fields.officialEmail;
            Object.assign(entity, definedErpDetails(fields));
            await repo.save(entity);
            return true;
        }
        if (!fields.name) return false;
        const created = await repo.save(
            repo.create({
                erpId,
                legalName: fields.name,
                shortName: fields.name,
                isActive: fields.isActive,
                inn: fields.inn ?? null,
                erpGroupLabel: fields.erpGroupLabel ?? null,
                departmentId: fields.departmentId ?? null,
                assignedManagerId: fields.assignedManagerId ?? null,
                managerErpId: fields.managerErpId ?? null,
                legalAddress: fields.legalAddress ?? null,
                factualAddress: fields.factualAddress ?? null,
                phone: fields.phone ?? null,
                officialEmail: fields.officialEmail ?? null,
                ...definedErpDetails(fields),
            }),
        );
        this.publishCreated(ctx, created);
        Logger.verbose(`Created partial counterparty erpId=${erpId} from Kafka stream`, loggerCtx);
        return true;
    }

    private publishCreated(ctx: RequestContext, counterparty: Counterparty): void {
        this.eventBus.publish(
            new CounterpartyCreatedEvent(ctx, String(counterparty.id), counterparty.erpId),
        );
    }

    // Backfill for rows left managerless when their erpId was still unlinked at event time
    // Skips rows already assigned, so a late backfill never overwrites a manual reassignment
    async backfillAssignedManager(
        ctx: RequestContext,
        managerErpId: string,
        administratorId: ID,
    ): Promise<number> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const result = await repo
            .createQueryBuilder()
            .update(Counterparty)
            .set({ assignedManagerId: String(administratorId) })
            .where('managerErpId = :managerErpId', { managerErpId })
            .andWhere('assignedManagerId IS NULL')
            .execute();
        const affected = result.affected ?? 0;
        if (affected > 0) {
            Logger.verbose(
                `Backfilled assignedManagerId=${String(administratorId)} for ${affected} counterparty row(s) waiting on managerErpId=${managerErpId}`,
                loggerCtx,
            );
        }
        return affected;
    }

    // Register-driven stream: creditBalance can change without other fields, and vice versa
    // No-op when no row exists for erpId: a balance alone cannot create a counterparty (no name)
    async updateCreditBalance(
        ctx: RequestContext,
        erpId: string,
        creditBalance: number,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const result = await repo.update({ erpId }, { creditBalance });
        if (!result.affected) {
            Logger.verbose(
                `counterparty creditBalance for erpId=${erpId}: no existing row, skipping`,
                loggerCtx,
            );
            return;
        }
        Logger.verbose(`Updated creditBalance for erpId=${erpId}`, loggerCtx);
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        await repo.update({ erpId }, { isActive: false });
        Logger.verbose(`Deactivated counterparty erpId=${erpId}`, loggerCtx);
    }

    async updateCredit(
        ctx: RequestContext,
        erpId: string,
        creditLimit: number,
        creditBalance: number,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        await repo.update({ erpId }, { creditLimit, creditBalance });
        Logger.verbose(`Updated credit for erpId=${erpId}`, loggerCtx);
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<Counterparty | null> {
        return this.connection.getRepository(ctx, Counterparty).findOne({ where: { erpId } });
    }

    async findAll(ctx: RequestContext): Promise<Counterparty[]> {
        return this.connection
            .getRepository(ctx, Counterparty)
            .find({ order: { shortName: 'ASC' } });
    }

    // Complete visible set, for scoping a different query (e.g. DocumentsService's IN filter)
    // Never for display or pagination: returns unbounded results, use findVisiblePage() instead
    async findVisible(ctx: RequestContext): Promise<Counterparty[]> {
        return this.applyVisibilityScope(ctx, this.baseVisibleQb(ctx)).then(qb => qb.getMany());
    }

    // Paginated variant for direct display; findVisible() is unbounded, which is wrong for scope 'all'
    // Scope 'all' roles would otherwise get an unbounded list of every counterparty
    async findVisiblePage(
        ctx: RequestContext,
        options: CounterpartyListFilter & {
            take?: number;
            skip?: number;
            sort?: CounterpartySortParameter;
        } = {},
    ): Promise<PaginatedList<Counterparty>> {
        const qb = await this.visibleFilteredQb(ctx, options);
        this.applySort(qb, options.sort);
        const totalItems = await qb.getCount();
        const items = await qb
            .take(options.take ?? 50)
            .skip(options.skip ?? 0)
            .getMany();
        return { items, totalItems };
    }

    async visibleFilteredQb(
        ctx: RequestContext,
        filter: CounterpartyListFilter,
    ): Promise<SelectQueryBuilder<Counterparty>> {
        const qb = await this.applyVisibilityScope(ctx, this.baseVisibleQb(ctx));
        return applyCounterpartyListFilter(qb, filter);
    }

    // Returns null, not ForbiddenError, for out-of-scope ids: don't leak that the id exists
    //
    async findOneVisible(ctx: RequestContext, id: ID): Promise<Counterparty | null> {
        let qb = this.baseVisibleQb(ctx).andWhere('c.id = :id', { id: String(id) });
        qb = await this.applyVisibilityScope(ctx, qb);
        return qb.getOne();
    }

    // KPIs are SQL aggregates over the scoped set, never load-all-and-reduce in JS
    // Separate summary query alongside the paginated list, as in fetchOrdersSummary
    async getSummary(ctx: RequestContext): Promise<{
        totalCount: number;
        activeCount: number;
        totalCreditBalance: number;
        highUsageCount: number;
    }> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        // Aggregate-only query, no GROUP BY — baseVisibleQb's ORDER BY shortName would be invalid
        // here (Postgres requires an ORDER BY column to be aggregated or grouped), so clear it.
        const raw = await qb
            .orderBy()
            .select('COUNT(*)', 'totalCount')
            .addSelect('COUNT(*) FILTER (WHERE c.isActive)', 'activeCount')
            .addSelect('COALESCE(SUM(c.creditBalance), 0)', 'totalCreditBalance')
            .addSelect(
                // TypeORM's alias replacement silently skips c.creditBalance::float, so camelCase columns need quotes
                // Without quotes Postgres fails with 42703; mocks don't catch this, integration tests do
                'COUNT(*) FILTER (WHERE c."creditLimit" > 0 AND c."creditBalance"::float / c."creditLimit" >= 0.8)',
                'highUsageCount',
            )
            .getRawOne<{
                totalCount: string;
                activeCount: string;
                totalCreditBalance: string;
                highUsageCount: string;
            }>();
        return {
            totalCount: Number(raw?.totalCount ?? 0),
            activeCount: Number(raw?.activeCount ?? 0),
            totalCreditBalance: Number(raw?.totalCreditBalance ?? 0),
            highUsageCount: Number(raw?.highUsageCount ?? 0),
        };
    }

    // Dashboard "Unassigned clients" KPI — a real COUNT scoped by the caller's visibility, not
    // a fetch-everything-then-count in JS.
    async countUnassigned(ctx: RequestContext): Promise<number> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        return qb.orderBy().andWhere('c.assignedManagerId IS NULL').getCount();
    }

    // Explicit LIMIT top-N, not fetching everything then slice(0,5) in JS
    // Same bounded pattern as popularProductIds(take)
    async findHighUsage(ctx: RequestContext, limit: number): Promise<Counterparty[]> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        // Quoted column names: TypeORM's alias replacement silently breaks on c.creditBalance::float
        // Unquoted camelCase columns fail in Postgres (42703).
        return qb
            .orderBy()
            .andWhere('c."creditLimit" > 0')
            .andWhere('c."creditBalance"::float / c."creditLimit" >= 0.8')
            .orderBy('c."creditBalance"::float / c."creditLimit"', 'DESC')
            .take(limit)
            .getMany();
    }

    private baseVisibleQb(ctx: RequestContext): SelectQueryBuilder<Counterparty> {
        return this.connection
            .getRepository(ctx, Counterparty)
            .createQueryBuilder('c')
            .orderBy('c.shortName', 'ASC');
    }

    // Only the first non-null sort key applies: one active sort, matching MvAdvancedDataTable
    // Falls back to baseVisibleQb's default (shortName ASC) when no sort is requested
    private applySort(
        qb: SelectQueryBuilder<Counterparty>,
        sort?: CounterpartySortParameter,
    ): void {
        if (!sort) return;
        for (const [field, order] of Object.entries(sort) as Array<
            [keyof CounterpartySortParameter, 'ASC' | 'DESC' | null | undefined]
        >) {
            if (!order) continue;
            qb.orderBy(SORTABLE_COLUMNS[field], order);
            return;
        }
    }

    private async applyVisibilityScope(
        ctx: RequestContext,
        qb: SelectQueryBuilder<Counterparty>,
    ): Promise<SelectQueryBuilder<Counterparty>> {
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        switch (scope.kind) {
            case 'own':
                this.accessScopeService.applyOwnCounterpartyFilter(qb, 'c', scope.administratorId);
                break;
            case 'department':
                // Only Branch gates visibility; Department is display-only and departmentId is never compared
                // Null branchId hides the row from branch-scoped roles (deny-by-default); no IS NULL carve-out
                qb.andWhere('c.branchId = :scopeBranch', { scopeBranch: scope.branchId ?? null });
                break;
            case 'all':
                break;
        }
        return qb;
    }

    async getForCustomer(ctx: RequestContext, customerId: ID): Promise<Counterparty | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT c.* FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = $1`,
            [customerId],
        );
        return result[0] ?? null;
    }

    // Read-only: shows an existing link only; creating it is the separate activation mutation
    //
    async getLinkedCustomerId(ctx: RequestContext, counterpartyId: ID): Promise<ID | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT cu.id AS id FROM customer cu
             WHERE cu."customFieldsCounterpartyid"::text = $1`,
            [String(counterpartyId)],
        );
        return result[0]?.id ?? null;
    }

    async setCustomerCounterparty(
        ctx: RequestContext,
        customerId: ID,
        erpId: string,
    ): Promise<void> {
        const counterparty = await this.findByErpId(ctx, erpId);
        if (!counterparty) throw new UserInputError(`Counterparty not found: erpId=${erpId}`);
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { counterpartyId: counterparty.id } as Record<string, unknown>,
        });
        await this.assignPriceType(ctx, customerId, counterparty.priceType);
    }

    async setCustomerRole(ctx: RequestContext, customerId: ID, role: string): Promise<void> {
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { portalRole: role } as Record<string, unknown>,
        });
    }

    private async assignPriceType(
        ctx: RequestContext,
        customerId: ID,
        priceType: string,
    ): Promise<void> {
        await this.customerPricingService.assignCustomerPriceTypeByCode(ctx, customerId, priceType);
        Logger.verbose(`Assigned customer ${customerId} to price type "${priceType}"`, loggerCtx);
    }
}

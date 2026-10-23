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
import { withAggregateLock, ctxQuery } from 'shared';

import { getInnStatus, InnStatus, withInnBindingGuard } from './counterparty-inn-guard';
import { applyCounterpartyListFilter, CounterpartyListFilter } from './counterparty-list-filter';
import { CounterpartyCreatedEvent } from './counterparty-created.event';
import { Counterparty } from './entities/counterparty.entity';
import {
    ActiveStateFields,
    activeStatePatch,
    newCounterpartyFromActiveState,
} from './counterparty-active-state';
import { selectHighUsage, summarizeCounterparties } from './counterparty-credit-queries';
import { applyCounterpartyVisibilityScope } from './counterparty-visibility';
import { applyCounterpartySort } from './counterparty-sort';
import { CounterpartySortParameter, CounterpartyUpsertPayload, loggerCtx } from './types';

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
                const record = await repo.findOne({ where: { erpId: payload.erpId } });
                let saved: Counterparty;
                if (record) {
                    await repo.update(record.id, payload);
                    saved = Object.assign(record, payload);
                } else {
                    saved = await repo.save(repo.create(payload));
                    this.publishCreated(txCtx, saved);
                }
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
            await repo.update(entity.id, activeStatePatch(fields));
            return true;
        }
        if (!fields.name) return false;
        const created = await repo.save(
            repo.create(newCounterpartyFromActiveState(erpId, fields.name, fields)),
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

    // Backfill for rows left managerless at event time; skips assigned rows so a manual reassignment survives.
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

    // No-op when no row exists: a balance alone cannot create a counterparty (no name)
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

    // Unbounded visible set, only for scoping another query (e.g. an IN filter); display uses findVisiblePage().
    async findVisible(ctx: RequestContext): Promise<Counterparty[]> {
        return this.applyVisibilityScope(ctx, this.baseVisibleQb(ctx)).then(qb => qb.getMany());
    }

    // Paginated variant for direct display; findVisible() is unbounded, wrong for scope 'all'
    async findVisiblePage(
        ctx: RequestContext,
        options: CounterpartyListFilter & {
            take?: number;
            skip?: number;
            sort?: CounterpartySortParameter;
        } = {},
    ): Promise<PaginatedList<Counterparty>> {
        const qb = await this.visibleFilteredQb(ctx, options);
        applyCounterpartySort(qb, options.sort);
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

    // The caller's visible erpIds as SQL for another plugin's own filter; null for scope 'all'.
    async visibleErpIdsSql(
        ctx: RequestContext,
    ): Promise<{ sql: string; params: Record<string, unknown> } | null> {
        if ((await this.accessScopeService.resolveCounterpartyScope(ctx)).kind === 'all')
            return null;
        const qb = (await this.visibleFilteredQb(ctx, {})).select('c.erpId').orderBy();
        return { sql: qb.getQuery(), params: qb.getParameters() };
    }

    // Returns null, not ForbiddenError, for out-of-scope ids: don't leak that the id exists
    async findOneVisible(ctx: RequestContext, id: ID): Promise<Counterparty | null> {
        let qb = this.baseVisibleQb(ctx).andWhere('c.id = :id', { id: String(id) });
        qb = await this.applyVisibilityScope(ctx, qb);
        return qb.getOne();
    }

    // KPIs are SQL aggregates over the scoped set, never load-all-and-reduce in JS.
    async getSummary(ctx: RequestContext): Promise<{
        totalCount: number;
        activeCount: number;
        totalCreditBalance: number;
        highUsageCount: number;
    }> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        return summarizeCounterparties(qb);
    }

    // Dashboard "Unassigned clients" KPI: a real COUNT scoped by the caller's visibility
    async countUnassigned(ctx: RequestContext): Promise<number> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        return qb.orderBy().andWhere('c.assignedManagerId IS NULL').getCount();
    }

    // Explicit LIMIT top-N, never fetch-everything-then-slice
    async findHighUsage(ctx: RequestContext, limit: number): Promise<Counterparty[]> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        return selectHighUsage(qb, limit);
    }

    private baseVisibleQb(ctx: RequestContext): SelectQueryBuilder<Counterparty> {
        return this.connection
            .getRepository(ctx, Counterparty)
            .createQueryBuilder('c')
            .orderBy('c.shortName', 'ASC');
    }

    private applyVisibilityScope(
        ctx: RequestContext,
        qb: SelectQueryBuilder<Counterparty>,
    ): Promise<SelectQueryBuilder<Counterparty>> {
        return applyCounterpartyVisibilityScope(this.accessScopeService, ctx, qb);
    }

    async getForCustomer(ctx: RequestContext, customerId: ID): Promise<Counterparty | null> {
        const result = await ctxQuery<Counterparty[]>(
            this.connection,
            ctx,
            `SELECT c.* FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = $1`,
            [customerId],
        );
        return result[0] ?? null;
    }

    // Read-only: shows an existing link only; creating it is the separate activation mutation
    async getLinkedCustomerId(ctx: RequestContext, counterpartyId: ID): Promise<ID | null> {
        const result = await ctxQuery<Array<{ id: ID }>>(
            this.connection,
            ctx,
            `SELECT cu.id AS id FROM customer cu
             WHERE cu."customFieldsCounterpartyid"::text = $1`,
            [String(counterpartyId)],
        );
        return result[0]?.id ?? null;
    }

    getInnStatus(ctx: RequestContext, counterparty: Counterparty): Promise<InnStatus> {
        return getInnStatus(this.connection, ctx, counterparty);
    }

    async setCustomerCounterparty(
        ctx: RequestContext,
        customerId: ID,
        erpId: string,
    ): Promise<void> {
        const counterparty = await this.findByErpId(ctx, erpId);
        if (!counterparty) throw new UserInputError(`Counterparty not found: erpId=${erpId}`);
        const bind = async (txCtx: RequestContext): Promise<void> => {
            await this.customerService.update(txCtx, {
                id: customerId,
                customFields: { counterpartyId: counterparty.id } as Record<string, unknown>,
            });
            await this.assignPriceType(txCtx, customerId, counterparty.priceType);
        };
        const rows = await ctxQuery<{ id: string }[]>(
            this.connection,
            ctx,
            `SELECT id::text AS id FROM customer
             WHERE id::text = $1 AND "customFieldsCounterpartyid"::text = $2`,
            [String(customerId), String(counterparty.id)],
        );
        if (rows.length > 0) return this.connection.withTransaction(ctx, bind);
        await withInnBindingGuard(this.connection, ctx, counterparty, bind);
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

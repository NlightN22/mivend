import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AdministratorService,
    CustomerService,
    ForbiddenError,
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { VersioningService } from '@mivend/plugin-versioning';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyUpsertPayload, loggerCtx } from './types';

@Injectable()
export class CounterpartyService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private customerPricingService: CustomerPricingService,
        private accessScopeService: AccessScopeService,
        private administratorService: AdministratorService,
        private versioningService: VersioningService,
    ) {}

    async upsert(ctx: RequestContext, payload: CounterpartyUpsertPayload): Promise<Counterparty> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        let record = await repo.findOne({ where: { erpId: payload.erpId } });
        if (record) {
            Object.assign(record, payload);
        } else {
            record = repo.create(payload);
        }
        const saved = await repo.save(record);
        Logger.verbose(`Upserted counterparty erpId=${payload.erpId}`, loggerCtx);
        return saved;
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

    /**
     * Row-level visibility for the admin `counterparties` query — resolves the caller's scope
     * via AccessScopeService and filters accordingly. See docs/access-control.md, layer 3.
     */
    // Full scoped id-set — used internally by callers that need the complete visible-counterparty
    // set to scope a DIFFERENT query (e.g. DocumentsService.findVisible()'s `IN (ids)` filter,
    // see docs/access-control.md "resources whose visibility is derived from another resource").
    // Not for direct display/pagination — see findVisiblePage() below for the manager-portal
    // Customers list, which is the one that actually needs take/skip (see issue #39).
    async findVisible(ctx: RequestContext): Promise<Counterparty[]> {
        return this.applyVisibilityScope(ctx, this.baseVisibleQb(ctx)).then(qb => qb.getMany());
    }

    // Manager portal Customers list (docs/ai/manager-portal-pages/05-customers.md) — same scope
    // resolution as findVisible() above, but paginated for direct display instead of returning
    // every visible counterparty unbounded. See issue #39 ("Audit: unbounded/unpaginated list
    // queries...") — this was flagged as company-wide unbounded for portal-admin/general-director
    // (scope 'all').
    async findVisiblePage(
        ctx: RequestContext,
        options: { take?: number; skip?: number; search?: string } = {},
    ): Promise<PaginatedList<Counterparty>> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        if (options.search) {
            qb = qb.andWhere(
                '(c.shortName ILIKE :search OR c.legalName ILIKE :search OR c.inn ILIKE :search)',
                { search: `%${options.search}%` },
            );
        }
        const totalItems = await qb.getCount();
        const items = await qb
            .take(options.take ?? 50)
            .skip(options.skip ?? 0)
            .getMany();
        return { items, totalItems };
    }

    // Single counterparty, visibility-checked the same way as the list — returns null (not
    // ForbiddenError) if the id exists but is outside the caller's scope, same "hide, don't leak
    // existence" convention as Vendure's own entity resolvers.
    async findOneVisible(ctx: RequestContext, id: ID): Promise<Counterparty | null> {
        let qb = this.baseVisibleQb(ctx).andWhere('c.id = :id', { id: String(id) });
        qb = await this.applyVisibilityScope(ctx, qb);
        return qb.getOne();
    }

    // Manager portal Customers list KPI cards (activeCount/totalCreditBalance/highUsageCount) —
    // real SQL aggregates over the scoped set, not "load everything and reduce() in JS" (which
    // was the original antipattern this whole audit started from, see issue #39). Mirrors the
    // reference pattern in `fetchOrdersSummary` (packages/manager/src/api/orders.ts) of one
    // dedicated summary query alongside the paginated list query.
    async getSummary(
        ctx: RequestContext,
    ): Promise<{
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
                // Explicit double-quoted column names, not TypeORM's `c.creditBalance` alias
                // syntax — its regex-based alias replacement silently fails to rewrite
                // `c.creditBalance::float` (the `::` cast breaks the match), sending the raw
                // unquoted `c.creditbalance` to Postgres, which then 42703s (camelCase columns
                // need quoting). Caught by the integration test below, not by any mock.
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

    // "Needs attention" panel on the Customers list (docs/ai/manager-portal-pages/05-customers.md)
    // — a small, explicitly bounded top-N query (LIMIT, not an unbounded fetch-everything-then-
    // slice(0,5) in JS, which was the original antipattern). Same shape as
    // `popularProductIds(take)` elsewhere in this codebase.
    async findHighUsage(ctx: RequestContext, limit: number): Promise<Counterparty[]> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        // Explicit double-quoted column names — see getSummary()'s comment for why
        // `c.creditBalance::float` (unquoted alias syntax) silently breaks TypeORM's column
        // replacement here.
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

    private async applyVisibilityScope(
        ctx: RequestContext,
        qb: SelectQueryBuilder<Counterparty>,
    ): Promise<SelectQueryBuilder<Counterparty>> {
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        switch (scope.kind) {
            case 'own':
                qb.andWhere('c.assignedManagerId = :scopeAdminId', {
                    scopeAdminId: scope.administratorId ?? null,
                });
                break;
            case 'department':
                qb.andWhere('c.departmentId = :scopeDept AND c.branchId = :scopeBranch', {
                    scopeDept: scope.departmentId ?? null,
                    scopeBranch: scope.branchId ?? null,
                });
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

    // Changes assignedManagerId — department-head only within their own department, portal-admin
    // unrestricted, matching CustomPermission.ReassignCounterpartyManager's doc comment. Reuses
    // AccessScopeService's counterparty scope resolution rather than a bespoke role check: a
    // 'department' scope caller may only reassign a counterparty already in their own
    // department/branch, and only to an administrator who is themselves in that same
    // department (never lending a client out to a manager the dept-head doesn't oversee).
    async reassignManager(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID,
    ): Promise<Counterparty> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const counterparty = await repo.findOne({ where: { id: counterpartyId } });
        if (!counterparty) throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);

        // 'own' scope is never actually reachable here in practice — only department-head/
        // portal-admin hold CustomPermission.ReassignCounterpartyManager, and those roles are
        // always 'department'/'all' scoped for the counterparty resource — but
        // assertCounterpartyWritable is the shared, generically-correct check (see its doc
        // comment), so it's used here rather than a bespoke inline department-only check.
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        if (scope.kind === 'department') {
            const target = await this.administratorService.findOne(ctx, administratorId);
            const targetDepartmentId = (
                target?.customFields as { departmentId?: string | null } | undefined
            )?.departmentId;
            if (!target || targetDepartmentId !== scope.departmentId) {
                throw new ForbiddenError();
            }
        }

        const previousManagerId = counterparty.assignedManagerId;
        counterparty.assignedManagerId = String(administratorId);
        const saved = await repo.save(counterparty);
        Logger.verbose(
            `Reassigned counterparty id=${counterpartyId} to administrator=${administratorId}`,
            loggerCtx,
        );
        await this.versioningService.recordChange(ctx, {
            entityName: 'Counterparty',
            entityId: saved.id,
            action: 'update',
            changedFields: {
                assignedManagerId: { from: previousManagerId, to: saved.assignedManagerId },
            },
        });
        return saved;
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

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

    // Issue #104: Integration Service's `counterparty` Kafka stream (verified live against
    // @nlightn22/event-contracts@0.38.0, search-platform#118/#92) carries name/isActive/
    // isDeleted/managerId(s)/inn/erpGroupLabel/departmentId — never creditLimit/paymentDelayDays/
    // priceType/branchId, which stay erp-import/REST-only fields (same shape as #88's
    // OrganizationChanged vs. OrganizationRequisitesRecord gap). creditBalance moved to its own
    // register-driven stream (search-platform#129 — see updateCreditBalance below), not part of
    // this event. `assignedManagerId` here is an already-resolved Vendure Administrator.id (see
    // CounterpartyStreamHandler/UserEnrichmentService, issue #109) — this method itself never
    // does 1C-erpId↔Administrator resolution, only writes whatever id the caller already
    // resolved. Distinct from upsert() above, which expects the full REST payload shape and must
    // not be reused here. Always creates/updates a row so a counterparty mivend only knows about
    // via Kafka (e.g. the staging-integration contour, which never runs erp-import — issue #68)
    // is not permanently absent; creditLimit/paymentDelayDays/priceType/branchId stay at their
    // existing value or entity default until erp-import's own record arrives, if it ever does in
    // this contour — never fabricated here.
    //
    // `fields.name: null` (deletion tombstone): the stream's deletion events never carry a name,
    // only entityId/isDeleted — same convention confirmed for organization/department. Updates
    // isActive on an already-known counterparty without touching legalName/shortName, and is a
    // deliberate no-op (never creates a row) when no existing row matches erpId — a deletion
    // tombstone must never fabricate a brand-new counterparty with a blank name.
    //
    // `fields.inn`/`erpGroupLabel`/`departmentId`/`assignedManagerId` are `undefined` when the
    // event omits them (real optional-scalar presence, not the proto3 zero-value-omission
    // ambiguity — see #135) and `null` when 1C explicitly cleared them (or, for
    // `assignedManagerId`, when the caller found no manager assigned at all) — only `undefined`
    // is treated as "leave unchanged"; `null` is applied like any other real value.
    async upsertActiveState(
        ctx: RequestContext,
        erpId: string,
        fields: {
            name: string | null;
            isActive: boolean;
            inn?: string | null;
            erpGroupLabel?: string | null;
            departmentId?: string | null;
            assignedManagerId?: string | null;
            // The raw erpId assignedManagerId was (or would be) resolved from — always passed
            // together with assignedManagerId by CounterpartyStreamHandler, even when
            // assignedManagerId itself is undefined/null. See Counterparty.managerErpId's own
            // doc comment.
            managerErpId?: string | null;
        },
    ): Promise<void> {
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
            await repo.save(entity);
            return;
        }
        if (!fields.name) return;
        await repo.save(
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
            }),
        );
        Logger.verbose(`Created partial counterparty erpId=${erpId} from Kafka stream`, loggerCtx);
    }

    // mivend.audit.common (2026-09-20): called from AdministratorLinkedListener once an erpId
    // links to an Administrator — resolves every Counterparty that was left with no manager
    // because its `counterparty` event was processed while that erpId was still `unlinked` (see
    // CounterpartyStreamHandler.resolveAssignedManagerId's "known, not a race" branch). Bounded,
    // indexed lookup (Counterparty.managerErpId has its own index) — never touches a row whose
    // assignedManagerId is already set, so a later manual reassignment (portal
    // reassignManager) is never clobbered by a backfill running late.
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

    // search-platform#129: CounterpartyCreditBalanceChanged is a separate, register-driven stream
    // (AccumulationRegister_ВзаиморасчетыСКонтрагентами), independent of CounterpartyChanged's own
    // catalog-change trigger — creditBalance can change without any other Counterparty field
    // changing, and vice versa. Deliberate no-op when no row exists yet for this erpId — same
    // never-fabricate-a-new-row rule as upsertActiveState (a balance update is meaningless without
    // the counterparty itself already existing, and this stream carries no name to create one).
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
        options: {
            take?: number;
            skip?: number;
            search?: string;
            status?: string;
            managerId?: ID;
            branchId?: string;
            groupLabel?: string;
            unassignedOnly?: boolean;
        } = {},
    ): Promise<PaginatedList<Counterparty>> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        if (options.search) {
            qb = qb.andWhere(
                '(c.shortName ILIKE :search OR c.legalName ILIKE :search OR c.inn ILIKE :search)',
                { search: `%${options.search}%` },
            );
        }
        // User-chosen narrowing filters, applied on TOP of the access-scope restriction above —
        // never a replacement for it (a manager's own 'own'/'department' scope still bounds what
        // they can filter to, this only narrows further within that already-visible set).
        if (options.status === 'active') {
            qb = qb.andWhere('c.isActive = true');
        } else if (options.status === 'inactive') {
            qb = qb.andWhere('c.isActive = false');
        }
        // Separate boolean, not `managerId: null`, since GraphQL/TypeORM would need to
        // distinguish "field omitted" from "field explicitly null" to express IS NULL safely —
        // a dedicated flag avoids that ambiguity entirely. Takes precedence over `managerId`
        // (mutually exclusive from the UI's perspective — the Manager select's "Unassigned"
        // option sends only `unassignedOnly: true`, never both).
        if (options.unassignedOnly) {
            qb = qb.andWhere('c.assignedManagerId IS NULL');
        } else if (options.managerId) {
            qb = qb.andWhere('c.assignedManagerId = :managerId', {
                managerId: String(options.managerId),
            });
        }
        if (options.branchId) {
            qb = qb.andWhere('c.branchId = :branchId', { branchId: options.branchId });
        }
        if (options.groupLabel) {
            qb = qb.andWhere('c.erpGroupLabel = :groupLabel', { groupLabel: options.groupLabel });
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

    // Dashboard "Unassigned clients" KPI — a real COUNT scoped by the caller's visibility, not
    // a fetch-everything-then-count in JS.
    async countUnassigned(ctx: RequestContext): Promise<number> {
        let qb = this.baseVisibleQb(ctx);
        qb = await this.applyVisibilityScope(ctx, qb);
        return qb.orderBy().andWhere('c.assignedManagerId IS NULL').getCount();
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
                this.accessScopeService.applyOwnCounterpartyFilter(qb, 'c', scope.administratorId);
                break;
            case 'department':
                // Corrected direction (2026-09-20, per an explicit product decision): `Department`
                // (1C's own org unit) is pure display/informational data and must NEVER gate
                // visibility of anything — only `Branch` (mivend's own entity) is a real
                // access-scope dimension. `departmentId` is deliberately never compared here.
                //
                // Security-first correction (2026-09-20, same day, per an explicit product
                // decision overriding the temporary no-op this replaces): a branch-scoped
                // manager must never see a Counterparty that isn't theirs, full stop — including
                // one with no `branchId` assigned yet. `Counterparty.branchId` has no automatic
                // assignment worker yet (issue #65/#123, "unsorted, needs manual triage"), so
                // until it ships, unassigned rows are invisible to every branch-scoped role, not
                // shown to all of them — deny-by-default, not permissive-by-default. Only
                // 'all'-scope roles (general-director, portal-admin) see unassigned rows, same as
                // every other counterparty. There is deliberately no `OR c.branchId IS NULL`
                // carve-out here (unlike Order/Invoice's own denormalized-branch filter) — see
                // docs/access-control.md's "Branch scope" section for why Counterparty's
                // no-carve-out rule differs from Order/Invoice's.
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

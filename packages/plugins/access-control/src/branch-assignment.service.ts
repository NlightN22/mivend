import { Inject, Injectable } from '@nestjs/common';
import {
    Administrator,
    EventBus,
    Logger,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { ctxQuery, withAggregateLock } from 'shared';

import { BranchAssignmentRetryEvent, SkippedRows } from './branch-assignment-retry.event';
import {
    CounterpartyBranchSignals,
    resolveCounterpartyBranch,
    resolveDepartmentBranch,
    subtreeOf,
} from './department-branch-resolver';
import { DepartmentBranchMapping } from './entities/department-branch-mapping.entity';
import { Department } from './entities/department.entity';
import { ACCESS_CONTROL_PLUGIN_OPTIONS, AccessControlPluginOptions, loggerCtx } from './types';

export interface CounterpartyScope {
    ids?: string[];
    erpId?: string;
    managerErpId?: string;
}

interface CounterpartyRow extends CounterpartyBranchSignals {
    id: number;
    branchId: string | null;
}

const BRANCH_LOCK = 'branch-assignment';
const COUNTERPARTY_BATCH = 500;
const MAX_RETRY_ATTEMPTS = 5;

// The single writer of Administrator.customFields.branchId and Counterparty.branchId. One global
// lock serializes every writer; each run re-reads mapping and tree under it (docs/concurrency.md).
@Injectable()
export class BranchAssignmentService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(ACCESS_CONTROL_PLUGIN_OPTIONS) private options: AccessControlPluginOptions,
        private eventBus: EventBus,
    ) {}

    get isReplica(): boolean {
        return this.options.instanceType === 'branch';
    }

    async resolveBranchId(
        ctx: RequestContext,
        departmentErpId: string | null,
    ): Promise<string | null> {
        const { parentOf, mapping } = await this.loadTree(ctx);
        const resolved = resolveDepartmentBranch(departmentErpId, parentOf, mapping);
        return resolved ? String(resolved.branchId) : null;
    }

    async assignAdministrator(
        ctx: RequestContext,
        administratorId: string | number,
    ): Promise<void> {
        await this.reconcile(ctx, { admins: { ids: [String(administratorId)] } });
    }

    async assignCounterparties(ctx: RequestContext, scope: CounterpartyScope): Promise<void> {
        if (scope.ids?.length === 0) return;
        await this.reconcile(ctx, { counterparties: scope });
    }

    async reconcileSubtree(ctx: RequestContext, departmentErpId: string): Promise<void> {
        await this.reconcile(ctx, { admins: {}, counterparties: {}, subtreeRoot: departmentErpId });
    }

    async reconcileAll(ctx: RequestContext): Promise<void> {
        await this.reconcile(ctx, { admins: {}, counterparties: {} });
    }

    // Re-runs exactly the rows an earlier pass skipped because a writer held them (after that commit).
    async retrySkipped(ctx: RequestContext, skipped: SkippedRows, attempt: number): Promise<void> {
        await this.reconcile(
            ctx,
            {
                admins: skipped.administratorIds.length
                    ? { ids: skipped.administratorIds }
                    : undefined,
                counterparties: skipped.counterpartyIds.length
                    ? { ids: skipped.counterpartyIds }
                    : undefined,
            },
            attempt,
        );
    }

    // Runs `write`, then reconciles if a branch input changed, the row is new, or the stored branch differs
    // from the resolved one. Rows locked by a mapping edit are caught by the retry, not by this check.
    async assignCounterpartyIfInputsChanged<T>(
        ctx: RequestContext,
        erpId: string,
        write: () => Promise<T>,
    ): Promise<T> {
        if (this.isReplica) return write();
        const before = await this.counterpartyState(ctx, erpId);
        const result = await write();
        const after = await this.counterpartyState(ctx, erpId);
        if (before === null || after === null || before.inputs !== after.inputs || !after.settled) {
            await this.assignCounterparties(ctx, { erpId });
        }
        return result;
    }

    private async counterpartyState(
        ctx: RequestContext,
        erpId: string,
    ): Promise<{ inputs: string; settled: boolean } | null> {
        const rows = await ctxQuery<Array<CounterpartyRow & { inputs: string }>>(
            this.connection,
            ctx,
            `SELECT c.id, c."branchId", c."branchOverrideId" AS override, c."departmentId" AS "ownDepartmentErpId",
                    COALESCE(a."customFieldsDepartmentid", eu."departmentId") AS "managerDepartmentErpId",
                    jsonb_build_array(c."branchOverrideId", c."departmentId", c."managerErpId",
                        c."assignedManagerId", COALESCE(a."customFieldsDepartmentid", eu."departmentId"))::text AS inputs
               FROM counterparty c
               LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
               LEFT JOIN erp_user eu ON eu."erpId" = c."managerErpId"
              WHERE c."erpId" = $1`,
            [erpId],
        );
        const row = rows[0];
        if (!row) return null;
        const { parentOf, mapping } = await this.loadTree(ctx);
        const resolved = resolveCounterpartyBranch(row, parentOf, mapping);
        return { inputs: row.inputs, settled: (row.branchId ?? null) === resolved };
    }

    private async reconcile(
        ctx: RequestContext,
        scope: {
            admins?: { ids?: string[] };
            counterparties?: CounterpartyScope;
            subtreeRoot?: string;
        },
        attempt = 0,
    ): Promise<void> {
        if (this.isReplica) return;
        const skipped: SkippedRows = { administratorIds: [], counterpartyIds: [] };
        if (scope.admins) {
            skipped.administratorIds = await this.withLock(ctx, async txCtx => {
                const { parentOf, mapping } = await this.loadTree(txCtx);
                return this.reconcileAdministrators(txCtx, parentOf, mapping, {
                    ids: scope.admins?.ids,
                    departments: this.subtree(scope.subtreeRoot, parentOf),
                });
            });
        }
        if (scope.counterparties) {
            // One lock per batch so a full scan never queues events behind it.
            let afterId = 0;
            for (;;) {
                const batch = await this.withLock(ctx, async txCtx => {
                    const { parentOf, mapping } = await this.loadTree(txCtx);
                    return this.reconcileCounterparties(txCtx, parentOf, mapping, {
                        scope: scope.counterparties,
                        departments: this.subtree(scope.subtreeRoot, parentOf),
                        afterId,
                    });
                });
                skipped.counterpartyIds.push(...batch.skipped);
                if (batch.scanned < COUNTERPARTY_BATCH) break;
                afterId = batch.lastId;
            }
        }
        if (skipped.administratorIds.length === 0 && skipped.counterpartyIds.length === 0) return;
        if (attempt >= MAX_RETRY_ATTEMPTS) {
            Logger.error(
                `branch assignment: ${skipped.administratorIds.length} administrator(s) and ${skipped.counterpartyIds.length} counterparty row(s) still locked after ${attempt} retries; the scheduled backstop will repair them`,
                loggerCtx,
            );
            return;
        }
        await this.eventBus.publish(new BranchAssignmentRetryEvent(ctx, skipped, attempt + 1));
    }

    private subtree(
        root: string | undefined,
        parentOf: Map<string, string | null>,
    ): Set<string> | null {
        return root ? subtreeOf(root, parentOf) : null;
    }

    private withLock<T>(
        ctx: RequestContext,
        work: (txCtx: RequestContext) => Promise<T>,
    ): Promise<T> {
        return withAggregateLock(this.connection, ctx, BRANCH_LOCK, work);
    }

    private async loadTree(
        ctx: RequestContext,
    ): Promise<{ parentOf: Map<string, string | null>; mapping: Map<string, number> }> {
        const departments = await this.connection
            .getRepository(ctx, Department)
            .find({ select: ['erpId', 'parentErpId'] });
        const rows = await this.connection.getRepository(ctx, DepartmentBranchMapping).find();
        return {
            parentOf: new Map(departments.map(d => [d.erpId, d.parentErpId])),
            mapping: new Map(rows.map(r => [r.departmentErpId, r.branchId])),
        };
    }

    private async reconcileAdministrators(
        ctx: RequestContext,
        parentOf: Map<string, string | null>,
        mapping: Map<string, number>,
        filter: { ids?: string[]; departments: Set<string> | null },
    ): Promise<string[]> {
        const repo = this.connection.getRepository(ctx, Administrator);
        const candidates = await repo.find({
            where: filter.ids ? { id: In(filter.ids) } : {},
            select: ['id'],
            withDeleted: true,
            loadEagerRelations: false,
        });
        if (candidates.length === 0) return [];
        // A locked row is skipped and reported: its writer's commit may predate this pass's mapping.
        const admins = await repo.find({
            where: { id: In(candidates.map(c => c.id)) },
            withDeleted: true,
            loadEagerRelations: false,
            lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
        });
        const locked = new Set(admins.map(a => String(a.id)));
        for (const admin of admins) {
            const fields = admin.customFields as {
                departmentId?: string | null;
                branchId?: string | null;
            };
            const department = fields.departmentId ?? null;
            if (filter.departments && !(department && filter.departments.has(department))) continue;
            const resolved = resolveDepartmentBranch(department, parentOf, mapping);
            const branchId = resolved ? String(resolved.branchId) : null;
            if ((fields.branchId ?? null) === branchId) continue;
            await repo.update(admin.id, { customFields: { branchId } });
            Logger.verbose(
                `administrator ${admin.id}: branchId -> ${branchId ?? 'null'}`,
                loggerCtx,
            );
        }
        return candidates.map(c => String(c.id)).filter(id => !locked.has(id));
    }

    private async reconcileCounterparties(
        ctx: RequestContext,
        parentOf: Map<string, string | null>,
        mapping: Map<string, number>,
        filter: { scope?: CounterpartyScope; departments: Set<string> | null; afterId: number },
    ): Promise<{ scanned: number; lastId: number; skipped: string[] }> {
        const candidates = await ctxQuery<Array<{ id: number }>>(
            this.connection,
            ctx,
            `SELECT c.id
               FROM counterparty c
               LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
               LEFT JOIN erp_user eu ON eu."erpId" = c."managerErpId"
              WHERE ($1::text[] IS NULL OR c.id::text = ANY($1))
                AND ($2::text IS NULL OR c."erpId" = $2)
                AND ($3::text IS NULL OR c."managerErpId" = $3)
                AND ($4::text[] IS NULL OR c."departmentId" = ANY($4)
                     OR COALESCE(a."customFieldsDepartmentid", eu."departmentId") = ANY($4))
                AND c.id > $5
              ORDER BY c.id LIMIT ${COUNTERPARTY_BATCH}`,
            [
                filter.scope?.ids ?? null,
                filter.scope?.erpId ?? null,
                filter.scope?.managerErpId ?? null,
                filter.departments ? [...filter.departments] : null,
                filter.afterId,
            ],
        );
        const ids = candidates.map(c => c.id);
        const result = { scanned: ids.length, lastId: ids.length ? ids[ids.length - 1] : 0 };
        if (ids.length === 0) return { ...result, skipped: [] };
        // Rows held by an in-flight writer are skipped and reported for a post-commit retry.
        const rows = await ctxQuery<CounterpartyRow[]>(
            this.connection,
            ctx,
            `SELECT c.id, c."branchId", c."branchOverrideId" AS override, c."departmentId" AS "ownDepartmentErpId",
                    COALESCE(a."customFieldsDepartmentid", eu."departmentId") AS "managerDepartmentErpId"
               FROM counterparty c
               LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
               LEFT JOIN erp_user eu ON eu."erpId" = c."managerErpId"
              WHERE c.id = ANY($1::int[])
              ORDER BY c.id
                FOR UPDATE OF c SKIP LOCKED`,
            [ids],
        );
        const lockedIds = new Set(rows.map(r => r.id));
        const skipped = ids.filter(id => !lockedIds.has(id)).map(String);
        const changed = rows
            .map(row => ({
                id: row.id,
                next: resolveCounterpartyBranch(row, parentOf, mapping),
                row,
            }))
            .filter(({ next, row }) => (row.branchId ?? null) !== next);
        if (changed.length === 0) return { ...result, skipped };
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE counterparty c SET "branchId" = v.branch, "updatedAt" = now()
               FROM unnest($1::int[], $2::text[]) AS v(id, branch)
              WHERE c.id = v.id`,
            [changed.map(c => c.id), changed.map(c => c.next)],
        );
        Logger.verbose(`counterparty branchId reassigned for ${changed.length} row(s)`, loggerCtx);
        return { ...result, skipped };
    }
}

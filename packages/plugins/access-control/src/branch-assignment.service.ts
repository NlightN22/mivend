import { Inject, Injectable } from '@nestjs/common';
import { Administrator, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

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

// The single writer of Administrator.customFields.branchId and Counterparty.branchId. One global
// lock serializes every writer; each run re-reads mapping and tree under it (docs/concurrency.md).
@Injectable()
export class BranchAssignmentService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(ACCESS_CONTROL_PLUGIN_OPTIONS) private options: AccessControlPluginOptions,
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
        await this.reconcile(ctx, { administratorId: String(administratorId) });
    }

    async assignCounterparties(ctx: RequestContext, scope: CounterpartyScope): Promise<void> {
        if (scope.ids?.length === 0) return;
        await this.reconcile(ctx, { counterparty: scope });
    }

    async reconcileSubtree(ctx: RequestContext, departmentErpId: string): Promise<void> {
        await this.reconcile(ctx, { subtreeRoot: departmentErpId });
    }

    async reconcileAll(ctx: RequestContext): Promise<void> {
        await this.reconcile(ctx, {});
    }

    // Runs `write`, then reconciles only if a branch input of the counterparty changed (or the row is new);
    // unchanged inputs stay correct because every mapping edit reconciles its subtree.
    async assignCounterpartyIfInputsChanged<T>(
        ctx: RequestContext,
        erpId: string,
        write: () => Promise<T>,
    ): Promise<T> {
        if (this.isReplica) return write();
        const before = await this.counterpartyInputs(ctx, erpId);
        const result = await write();
        if (before === null || before !== (await this.counterpartyInputs(ctx, erpId))) {
            await this.assignCounterparties(ctx, { erpId });
        }
        return result;
    }

    private async counterpartyInputs(ctx: RequestContext, erpId: string): Promise<string | null> {
        const rows = await ctxQuery<Array<{ inputs: string }>>(
            this.connection,
            ctx,
            `SELECT concat_ws('|', c."branchOverrideId", c."departmentId", c."managerErpId", c."assignedManagerId",
                    COALESCE(a."customFieldsDepartmentid", eu."departmentId")) AS inputs
               FROM counterparty c
               LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
               LEFT JOIN erp_user eu ON eu."erpId" = c."managerErpId"
              WHERE c."erpId" = $1`,
            [erpId],
        );
        return rows[0]?.inputs ?? null;
    }

    private async reconcile(
        ctx: RequestContext,
        scope: { administratorId?: string; counterparty?: CounterpartyScope; subtreeRoot?: string },
    ): Promise<void> {
        if (this.isReplica) return;
        if (!scope.counterparty) {
            await this.withLock(ctx, async txCtx => {
                const { parentOf, mapping } = await this.loadTree(txCtx);
                await this.reconcileAdministrators(txCtx, parentOf, mapping, {
                    id: scope.administratorId,
                    departments: this.subtree(scope.subtreeRoot, parentOf),
                });
            });
        }
        if (scope.administratorId) return;
        // One lock per batch so a full scan never queues events behind it.
        let afterId = 0;
        for (;;) {
            const batch = await this.withLock(ctx, async txCtx => {
                const { parentOf, mapping } = await this.loadTree(txCtx);
                return this.reconcileCounterparties(txCtx, parentOf, mapping, {
                    scope: scope.counterparty,
                    departments: this.subtree(scope.subtreeRoot, parentOf),
                    afterId,
                });
            });
            if (batch.scanned < COUNTERPARTY_BATCH) return;
            afterId = batch.lastId;
        }
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
        filter: { id?: string; departments: Set<string> | null },
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Administrator);
        // A row locked by an in-flight writer is skipped: that writer reconciles it right after its own write.
        const admins = await repo.find({
            where: filter.id ? { id: filter.id } : {},
            withDeleted: true,
            loadEagerRelations: false,
            lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
        });
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
    }

    private async reconcileCounterparties(
        ctx: RequestContext,
        parentOf: Map<string, string | null>,
        mapping: Map<string, number>,
        filter: { scope?: CounterpartyScope; departments: Set<string> | null; afterId: number },
    ): Promise<{ scanned: number; lastId: number }> {
        const rows = await ctxQuery<CounterpartyRow[]>(
            this.connection,
            ctx,
            `SELECT c.id, c."branchId", c."branchOverrideId" AS override, c."departmentId" AS "ownDepartmentErpId",
                    COALESCE(a."customFieldsDepartmentid", eu."departmentId") AS "managerDepartmentErpId"
               FROM counterparty c
               LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
               LEFT JOIN erp_user eu ON eu."erpId" = c."managerErpId"
              WHERE ($1::text[] IS NULL OR c.id::text = ANY($1))
                AND ($2::text IS NULL OR c."erpId" = $2)
                AND ($3::text IS NULL OR c."managerErpId" = $3)
                AND ($4::text[] IS NULL OR c."departmentId" = ANY($4)
                     OR COALESCE(a."customFieldsDepartmentid", eu."departmentId") = ANY($4))
                AND c.id > $5
              ORDER BY c.id LIMIT ${COUNTERPARTY_BATCH}
                FOR UPDATE OF c SKIP LOCKED`,
            [
                filter.scope?.ids ?? null,
                filter.scope?.erpId ?? null,
                filter.scope?.managerErpId ?? null,
                filter.departments ? [...filter.departments] : null,
                filter.afterId,
            ],
        );
        const changed = rows
            .map(row => ({
                id: row.id,
                next: resolveCounterpartyBranch(row, parentOf, mapping),
                row,
            }))
            .filter(({ next, row }) => (row.branchId ?? null) !== next);
        const result = { scanned: rows.length, lastId: rows.length ? rows[rows.length - 1].id : 0 };
        if (changed.length === 0) return result;
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE counterparty c SET "branchId" = v.branch, "updatedAt" = now()
               FROM unnest($1::int[], $2::text[]) AS v(id, branch)
              WHERE c.id = v.id`,
            [changed.map(c => c.id), changed.map(c => c.next)],
        );
        Logger.verbose(`counterparty branchId reassigned for ${changed.length} row(s)`, loggerCtx);
        return result;
    }
}

import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

import { BranchAssignmentService } from './branch-assignment.service';
import { resolveDepartmentBranch } from './department-branch-resolver';
import { Branch } from './entities/branch.entity';
import { DepartmentBranchMapping } from './entities/department-branch-mapping.entity';
import { Department } from './entities/department.entity';

export interface DepartmentBranchNode {
    departmentErpId: string;
    name: string;
    parentErpId: string | null;
    isActive: boolean;
    ownBranchId: string | null;
    effectiveBranchId: string | null;
    inheritedFromErpId: string | null;
    userCount: number;
    counterpartyCount: number;
}

@Injectable()
export class DepartmentBranchMappingService {
    constructor(
        private connection: TransactionalConnection,
        private branchAssignment: BranchAssignmentService,
    ) {}

    async set(ctx: RequestContext, departmentErpId: string, branchId: string): Promise<void> {
        this.assertCentral();
        await this.connection.withTransaction(ctx, async txCtx => {
            await this.requireDepartment(txCtx, departmentErpId);
            const branch = await this.connection
                .getRepository(txCtx, Branch)
                .findOne({ where: { id: branchId } });
            if (!branch) throw new UserInputError(`Branch ${branchId} does not exist`);
            await ctxQuery(
                this.connection,
                txCtx,
                `INSERT INTO department_branch_mapping ("departmentErpId", "branchId") VALUES ($1, $2)
                 ON CONFLICT ("departmentErpId") DO UPDATE SET "branchId" = EXCLUDED."branchId", "updatedAt" = now()`,
                [departmentErpId, branch.id],
            );
            await this.branchAssignment.reconcileSubtree(txCtx, departmentErpId);
        });
    }

    async clear(ctx: RequestContext, departmentErpId: string): Promise<void> {
        this.assertCentral();
        await this.connection.withTransaction(ctx, async txCtx => {
            await this.connection
                .getRepository(txCtx, DepartmentBranchMapping)
                .delete({ departmentErpId });
            await this.branchAssignment.reconcileSubtree(txCtx, departmentErpId);
        });
    }

    async setByBranchErpId(
        ctx: RequestContext,
        departmentErpId: string,
        branchErpId: string,
    ): Promise<void> {
        const branch = await this.connection
            .getRepository(ctx, Branch)
            .findOne({ where: { erpId: branchErpId } });
        if (!branch) throw new UserInputError(`No Branch with erpId "${branchErpId}"`);
        await this.set(ctx, departmentErpId, String(branch.id));
    }

    // Null clears the override and re-runs the automatic rule.
    async setCounterpartyOverride(
        ctx: RequestContext,
        counterpartyId: string,
        branchId: string | null,
    ): Promise<void> {
        this.assertCentral();
        await this.connection.withTransaction(ctx, async txCtx => {
            if (branchId !== null) {
                const branch = await this.connection
                    .getRepository(txCtx, Branch)
                    .findOne({ where: { id: branchId } });
                if (!branch) throw new UserInputError(`Branch ${branchId} does not exist`);
            }
            const updated = await ctxQuery<unknown[]>(
                this.connection,
                txCtx,
                `UPDATE counterparty SET "branchOverrideId" = $2 WHERE id::text = $1 RETURNING id`,
                [counterpartyId, branchId],
            );
            if (updated.length === 0)
                throw new UserInputError(`Counterparty ${counterpartyId} not found`);
            await this.branchAssignment.assignCounterparties(txCtx, { ids: [counterpartyId] });
        });
    }

    async overview(ctx: RequestContext): Promise<DepartmentBranchNode[]> {
        const departments = await this.connection
            .getRepository(ctx, Department)
            .find({ order: { name: 'ASC' } });
        const rows = await this.connection.getRepository(ctx, DepartmentBranchMapping).find();
        const mapping = new Map(rows.map(r => [r.departmentErpId, r.branchId]));
        const parentOf = new Map(departments.map(d => [d.erpId, d.parentErpId]));
        const users = await this.countBy(ctx, 'erp_user', 'departmentId');
        const counterparties = await this.countBy(ctx, 'counterparty', 'departmentId');
        return departments.map(d => {
            const resolved = resolveDepartmentBranch(d.erpId, parentOf, mapping);
            const own = mapping.get(d.erpId);
            return {
                departmentErpId: d.erpId,
                name: d.name,
                parentErpId: d.parentErpId,
                isActive: d.isActive,
                ownBranchId: own === undefined ? null : String(own),
                effectiveBranchId: resolved ? String(resolved.branchId) : null,
                inheritedFromErpId:
                    resolved && resolved.sourceDepartmentErpId !== d.erpId
                        ? resolved.sourceDepartmentErpId
                        : null,
                userCount: users.get(d.erpId) ?? 0,
                counterpartyCount: counterparties.get(d.erpId) ?? 0,
            };
        });
    }

    private async countBy(
        ctx: RequestContext,
        table: 'erp_user' | 'counterparty',
        column: 'departmentId',
    ): Promise<Map<string, number>> {
        const rows = await ctxQuery<Array<{ department: string; total: string }>>(
            this.connection,
            ctx,
            `SELECT "${column}" AS department, count(*) AS total FROM ${table}
              WHERE "${column}" IS NOT NULL GROUP BY "${column}"`,
        );
        return new Map(rows.map(r => [r.department, Number(r.total)]));
    }

    private async requireDepartment(ctx: RequestContext, erpId: string): Promise<void> {
        const found = await this.connection
            .getRepository(ctx, Department)
            .findOne({ where: { erpId } });
        if (!found) throw new UserInputError(`Department ${erpId} does not exist`);
    }

    private assertCentral(): void {
        if (this.branchAssignment.isReplica) {
            throw new UserInputError(
                'Branch assignment is maintained on the central instance only',
            );
        }
    }
}

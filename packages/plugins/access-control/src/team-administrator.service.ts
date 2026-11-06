import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Administrator, RequestContext, TransactionalConnection } from '@vendure/core';
import { IsNull } from 'typeorm';

import { AccessScopeService } from './access-scope.service';
import { AccessScope } from './types';

const TEAM_LIST_LIMIT = 200;

export type TeamBranchScope =
    | { kind: 'all' }
    | { kind: 'none' }
    | { kind: 'branch'; branchId: string };

// Vendure 3.7.3's findAll hides administrators whose roles the caller could not grant, so the team
// is read directly: 'all' sees every live administrator, others their branch (docs/access-control.md).
@Injectable()
export class TeamAdministratorService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
    ) {}

    // 'all' scope sees every branch; otherwise the caller's own branch, or nobody without one.
    async resolveBranch(ctx: RequestContext): Promise<TeamBranchScope> {
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        if (scope.kind === 'all') return { kind: 'all' };
        const branchId =
            scope.kind === 'department' ? scope.branchId : await this.callerBranchId(ctx, scope);
        return branchId == null ? { kind: 'none' } : { kind: 'branch', branchId: String(branchId) };
    }

    async findTeam(ctx: RequestContext): Promise<Administrator[]> {
        const branch = await this.resolveBranch(ctx);
        if (branch.kind === 'none') return [];
        return this.connection.getRepository(ctx, Administrator).find({
            where: {
                deletedAt: IsNull(),
                ...(branch.kind === 'branch' && { customFields: { branchId: branch.branchId } }),
            },
            relations: ['user', 'user.roles'],
            order: { id: 'ASC' },
            take: TEAM_LIST_LIMIT,
        });
    }

    private async callerBranchId(
        ctx: RequestContext,
        scope: AccessScope,
    ): Promise<string | undefined> {
        if (scope.administratorId == null) return undefined;
        const caller = await this.connection
            .getRepository(ctx, Administrator)
            .findOne({ where: { id: scope.administratorId, deletedAt: IsNull() } });
        const customFields = caller?.customFields as { branchId?: string | null } | undefined;
        return customFields?.branchId ?? undefined;
    }

    // Undefined unless the target is a live administrator in the caller's branch.
    async findInBranch(
        ctx: RequestContext,
        branchId: ID,
        administratorId: ID,
    ): Promise<Administrator | undefined> {
        const admin = await this.connection.getRepository(ctx, Administrator).findOne({
            where: {
                id: administratorId,
                deletedAt: IsNull(),
                customFields: { branchId: String(branchId) },
            },
        });
        return admin ?? undefined;
    }
}

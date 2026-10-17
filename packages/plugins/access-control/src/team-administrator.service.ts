import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    AdministratorService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { IsNull } from 'typeorm';

import { AccessScopeService } from './access-scope.service';

const TEAM_LIST_LIMIT = 200;

// Vendure 3.7.3 hides administrators whose roles the caller could not grant; a branch-scoped
// caller instead sees and assigns colleagues by mivend's branch scope (docs/access-control.md).
@Injectable()
export class TeamAdministratorService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private accessScopeService: AccessScopeService,
    ) {}

    async findTeam(ctx: RequestContext): Promise<Administrator[]> {
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        if (scope.kind !== 'department') {
            const result = await this.administratorService.findAll(ctx, { take: TEAM_LIST_LIMIT }, [
                'user.roles',
            ]);
            return result.items;
        }
        if (scope.branchId == null) return [];
        return this.connection.getRepository(ctx, Administrator).find({
            where: { deletedAt: IsNull(), customFields: { branchId: String(scope.branchId) } },
            relations: ['user', 'user.roles'],
            order: { id: 'ASC' },
            take: TEAM_LIST_LIMIT,
        });
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

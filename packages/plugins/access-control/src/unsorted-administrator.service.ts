import { Injectable } from '@nestjs/common';
import { SUPER_ADMIN_ROLE_CODE } from '@vendure/common/lib/shared-constants';
import {
    Administrator,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { RoleScopeConfigService } from './role-scope-config.service';

const MAX_TAKE = 100;

// Live administrators with no resolvable branch whose roles do not already see everything:
// a branch-scoped login without a branch sees nothing, so staff must sort them out (#123).
@Injectable()
export class UnsortedAdministratorService {
    constructor(
        private connection: TransactionalConnection,
        private roleScopeConfig: RoleScopeConfigService,
    ) {}

    async findPage(
        ctx: RequestContext,
        options?: { take?: number; skip?: number },
    ): Promise<PaginatedList<Administrator>> {
        const unrestricted = [
            SUPER_ADMIN_ROLE_CODE,
            ...(await this.roleScopeConfig.roleCodesWithScope(ctx, 'counterparty', 'all')),
        ];
        const [items, totalItems] = await this.connection
            .getRepository(ctx, Administrator)
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.user', 'user')
            .leftJoinAndSelect('user.roles', 'role')
            .where('a.deletedAt IS NULL')
            .andWhere('a."customFieldsBranchid" IS NULL')
            .andWhere(
                `NOT EXISTS (SELECT 1 FROM user_roles_role ur JOIN role r ON r.id = ur."roleId"
                 WHERE ur."userId" = a."userId" AND r.code IN (:...unrestricted))`,
                { unrestricted },
            )
            .orderBy('a.id', 'ASC')
            .take(Math.min(options?.take ?? 25, MAX_TAKE))
            .skip(options?.skip ?? 0)
            .getManyAndCount();
        return { items, totalItems };
    }
}

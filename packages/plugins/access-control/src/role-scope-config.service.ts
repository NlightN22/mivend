import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, Role, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { RoleAccessScope } from './entities/role-access-scope.entity';
import { AccessScopeKind, loggerCtx } from './types';

const SCOPE_RANK: Record<AccessScopeKind, number> = { own: 0, department: 1, all: 2 };

export interface AccessScopeConfig {
    [resource: string]: AccessScopeKind;
}

function parseAccessScopeConfig(row: RoleAccessScope): AccessScopeConfig | null {
    try {
        return JSON.parse(row.accessScopeConfig) as AccessScopeConfig;
    } catch {
        Logger.warn(`Role "${row.roleCode}" has invalid accessScopeConfig JSON`, loggerCtx);
        return null;
    }
}

/**
 * Role -> max-scope-per-resource is data (a dedicated table keyed by Role.code — Vendure's
 * Role entity does not support customFields), not a Permission — this is what replaces the
 * old ReadOwnX/ReadDepartmentX/ReadAllX permission triplets. See docs/access-control.md,
 * layer 2/3.
 */
@Injectable()
export class RoleScopeConfigService {
    constructor(private connection: TransactionalConnection) {}

    async maxScopeFor(
        ctx: RequestContext,
        roles: Role[],
        resource: string,
    ): Promise<AccessScopeKind> {
        if (roles.length === 0) return 'own';
        const rows = await this.connection.getRepository(ctx, RoleAccessScope).find({
            where: { roleCode: In(roles.map(role => role.code)) },
        });
        let best: AccessScopeKind = 'own';
        for (const row of rows) {
            const config = parseAccessScopeConfig(row);
            const kind = config?.[resource];
            if (kind && SCOPE_RANK[kind] > SCOPE_RANK[best]) {
                best = kind;
            }
        }
        return best;
    }

    async setScopeFor(
        ctx: RequestContext,
        roleCode: string,
        config: AccessScopeConfig,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, RoleAccessScope);
        let row = await repo.findOne({ where: { roleCode } });
        if (row) {
            row.accessScopeConfig = JSON.stringify(config);
        } else {
            row = repo.create({ roleCode, accessScopeConfig: JSON.stringify(config) });
        }
        await repo.save(row);
    }
}

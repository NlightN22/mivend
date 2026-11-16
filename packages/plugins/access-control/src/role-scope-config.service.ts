import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, Role, TransactionalConnection } from '@vendure/core';
import { findBounded } from 'shared';
import { In } from 'typeorm';

import { DEFAULT_ROLES } from './default-roles';
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

// Scope lives in a side table keyed by Role.code: Vendure's Role entity has no customFields.
// Not a Permission, so it replaces the ReadOwnX/ReadDepartmentX/ReadAllX permission triplets.
@Injectable()
export class RoleScopeConfigService {
    constructor(private connection: TransactionalConnection) {}

    async maxScopeFor(
        ctx: RequestContext,
        roles: Role[],
        resource: string,
    ): Promise<AccessScopeKind> {
        if (roles.length === 0) return 'own';
        const rows = await findBounded(
            this.connection.getRepository(ctx, RoleAccessScope),
            { where: { roleCode: In(roles.map(role => role.code)) } },
            roles.length,
        );
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

    async roleCodesWithScope(
        ctx: RequestContext,
        resource: string,
        kind: AccessScopeKind,
    ): Promise<string[]> {
        const rows = await findBounded(this.connection.getRepository(ctx, RoleAccessScope));
        return rows
            .filter(row => parseAccessScopeConfig(row)?.[resource] === kind)
            .map(row => row.roleCode);
    }

    // setScopeFor writes config unvalidated, so reads must go through parseAccessScopeConfig.
    async getScopeFor(ctx: RequestContext, roleCode: string): Promise<AccessScopeConfig | null> {
        const row = await this.connection
            .getRepository(ctx, RoleAccessScope)
            .findOne({ where: { roleCode } });
        return row ? parseAccessScopeConfig(row) : null;
    }

    // Reports only absent rows (deleted, or a role added to DEFAULT_ROLES); an edited config is intentional.
    async getProvisioningStatus(
        ctx: RequestContext,
    ): Promise<Array<{ roleCode: string; missing: boolean }>> {
        const rows = await findBounded(this.connection.getRepository(ctx, RoleAccessScope));
        const presentCodes = new Set(rows.map(row => row.roleCode));
        return DEFAULT_ROLES.map(definition => ({
            roleCode: definition.code,
            missing: !presentCodes.has(definition.code),
        }));
    }

    async createScopeIfMissing(
        ctx: RequestContext,
        roleCode: string,
        config: AccessScopeConfig,
    ): Promise<void> {
        await this.connection
            .getRepository(ctx, RoleAccessScope)
            .createQueryBuilder()
            .insert()
            .values({ roleCode, accessScopeConfig: JSON.stringify(config) })
            .orIgnore()
            .execute();
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

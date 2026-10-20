import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, Role, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { DEFAULT_ROLES } from './default-roles';
import { RoleAccessScope } from './entities/role-access-scope.entity';
import { AccessScopeKind, loggerCtx } from './types';

const SCOPE_RANK: Record<AccessScopeKind, number> = { own: 0, department: 1, all: 2 };

export interface AccessScopeConfig {
    [resource: string]: AccessScopeKind;
}

function configsMatch(a: AccessScopeConfig, b: AccessScopeConfig): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => a[key] === b[key]);
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

    async roleCodesWithScope(
        ctx: RequestContext,
        resource: string,
        kind: AccessScopeKind,
    ): Promise<string[]> {
        const rows = await this.connection.getRepository(ctx, RoleAccessScope).find();
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

    // Detects rows deleted/corrupted after bootstrap, or roles added to DEFAULT_ROLES since last boot.
    // Report-only: does not re-provision, the health-check alert surfaces the drift.
    async getProvisioningStatus(
        ctx: RequestContext,
    ): Promise<Array<{ roleCode: string; missing: boolean }>> {
        const rows = await this.connection.getRepository(ctx, RoleAccessScope).find();
        const rowByCode = new Map(rows.map(row => [row.roleCode, row]));
        return DEFAULT_ROLES.map(definition => {
            const row = rowByCode.get(definition.code);
            const config = row ? parseAccessScopeConfig(row) : null;
            return {
                roleCode: definition.code,
                missing: !config || !configsMatch(config, definition.accessScopeConfig),
            };
        });
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

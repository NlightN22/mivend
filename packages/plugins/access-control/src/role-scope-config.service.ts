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

    // Read-back for the Settings > Roles & Access UI — the config is written blindly via
    // setScopeFor today; this closes the matching read gap. Reuses parseAccessScopeConfig
    // (invalid-JSON logging + null-safety already handled there).
    async getScopeFor(ctx: RequestContext, roleCode: string): Promise<AccessScopeConfig | null> {
        const row = await this.connection
            .getRepository(ctx, RoleAccessScope)
            .findOne({ where: { roleCode } });
        return row ? parseAccessScopeConfig(row) : null;
    }

    // Issue #134 Part 2 — defense in depth for RoleProvisioningService's bootstrap-time
    // self-provisioning: detects a RoleAccessScope row later deleted/corrupted (e.g. a manual
    // truncate), or a role added to DEFAULT_ROLES with no reboot yet to provision it. Compares
    // the hardcoded DEFAULT_ROLES list against what's actually stored right now — does not
    // re-run provisioning itself, just reports drift for the health-check alert to surface.
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

import { Injectable } from '@nestjs/common';
import { Logger, Role } from '@vendure/core';

import { AccessScopeKind, loggerCtx } from './types';

const SCOPE_RANK: Record<AccessScopeKind, number> = { own: 0, department: 1, all: 2 };

interface AccessScopeConfig {
    [resource: string]: AccessScopeKind;
}

interface RoleWithAccessScopeConfig {
    code: string;
    customFields?: { accessScopeConfig?: string | null };
}

function parseAccessScopeConfig(role: Role): AccessScopeConfig | null {
    const raw = (role as unknown as RoleWithAccessScopeConfig).customFields?.accessScopeConfig;
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AccessScopeConfig;
    } catch {
        Logger.warn(`Role "${role.code}" has invalid accessScopeConfig JSON`, loggerCtx);
        return null;
    }
}

/**
 * Role -> max-scope-per-resource is data (a customField on Role), not a Permission —
 * this is what replaces the old ReadOwnX/ReadDepartmentX/ReadAllX permission triplets.
 * See docs/access-control.md, layer 2/3.
 */
@Injectable()
export class RoleScopeConfigService {
    maxScopeFor(roles: Role[], resource: string): AccessScopeKind {
        let best: AccessScopeKind = 'own';
        for (const role of roles) {
            const config = parseAccessScopeConfig(role);
            const kind = config?.[resource];
            if (kind && SCOPE_RANK[kind] > SCOPE_RANK[best]) {
                best = kind;
            }
        }
        return best;
    }
}

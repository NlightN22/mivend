import { DEFAULT_ROLES } from './default-roles';
import {
    PERMISSIONS_ADDED_BY_RELEASE,
    SCOPE_KEYS_ADDED_BY_RELEASE,
    type ReleasePermissionGrant,
    type ReleaseScopeKeyGrant,
} from './default-role-release-grants';

export interface SqlClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface GrantOutcome {
    roleCode: string;
    added: string[];
}

interface GrantPlan {
    permissions: string[];
    scope: Record<string, string> | null;
    record: string[];
    added: string[];
}

export function scopeGrantKey(resource: string): string {
    return `scope:${resource}`;
}

// Pure: applies the release entries of one role that are not yet recorded; never removes or changes a value.
export function planRoleGrants(
    roleCode: string,
    stored: string[],
    scope: Record<string, string> | null,
    recorded: Set<string>,
    permissionGrants: ReleasePermissionGrant[] = PERMISSIONS_ADDED_BY_RELEASE,
    scopeGrants: ReleaseScopeKeyGrant[] = SCOPE_KEYS_ADDED_BY_RELEASE,
): GrantPlan {
    const definition = DEFAULT_ROLES.find(d => d.code === roleCode);
    const plan: GrantPlan = {
        permissions: [...stored],
        scope: scope && { ...scope },
        record: [],
        added: [],
    };
    for (const grant of permissionGrants.filter(g => g.roleCode === roleCode)) {
        if (recorded.has(grant.permission)) continue;
        if (!plan.permissions.includes(grant.permission)) {
            plan.permissions.push(grant.permission);
            plan.added.push(grant.permission);
        }
        plan.record.push(grant.permission);
    }
    for (const grant of scopeGrants.filter(g => g.roleCode === roleCode)) {
        const key = scopeGrantKey(grant.resource);
        const value = definition?.accessScopeConfig[grant.resource];
        if (recorded.has(key) || !plan.scope || !value) continue;
        if (!(grant.resource in plan.scope)) {
            plan.scope[grant.resource] = value;
            plan.added.push(key);
        }
        plan.record.push(key);
    }
    return plan;
}

function parseScope(raw: unknown): Record<string, string> | null {
    try {
        const parsed: unknown = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null;
    } catch {
        return null;
    }
}

// Delivers rights a release added to default roles. Each entry is applied once per role and
// recorded, so a right an admin removes later stays removed. Adds only, removes nothing, idempotent.
export interface ReleaseGrantLists {
    permissions: ReleasePermissionGrant[];
    scopeKeys: ReleaseScopeKeyGrant[];
}

const RELEASE_GRANTS: ReleaseGrantLists = {
    permissions: PERMISSIONS_ADDED_BY_RELEASE,
    scopeKeys: SCOPE_KEYS_ADDED_BY_RELEASE,
};

export async function grantMissingDefaultPermissions(
    client: SqlClient,
    lists: ReleaseGrantLists = RELEASE_GRANTS,
): Promise<GrantOutcome[]> {
    const roleCodes = new Set([...lists.permissions, ...lists.scopeKeys].map(g => g.roleCode));
    const outcomes: GrantOutcome[] = [];
    for (const roleCode of roleCodes) {
        await client.query('BEGIN');
        try {
            const added = await grantForRole(client, roleCode, lists);
            if (added.length > 0) outcomes.push({ roleCode, added });
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    }
    return outcomes;
}

async function grantForRole(
    client: SqlClient,
    roleCode: string,
    lists: ReleaseGrantLists,
): Promise<string[]> {
    // unbounded-ok: role.code identifies one row
    const role = await client.query(`SELECT permissions FROM role WHERE code = $1 FOR UPDATE`, [
        roleCode,
    ]);
    if (!role.rows[0]) return [];
    // unbounded-ok: role_access_scope.roleCode is unique
    const scopeRow = await client.query(
        `SELECT "accessScopeConfig" FROM role_access_scope WHERE "roleCode" = $1 FOR UPDATE`,
        [roleCode],
    );
    // unbounded-ok: at most one row per release entry of this role
    const recorded = await client.query(
        `SELECT "grantKey" FROM role_default_grant WHERE "roleCode" = $1`,
        [roleCode],
    );
    const stored = String(role.rows[0].permissions)
        .split(',')
        .filter(permission => permission !== '');
    const scope = scopeRow.rows[0] ? parseScope(scopeRow.rows[0].accessScopeConfig) : null;
    const plan = planRoleGrants(
        roleCode,
        stored,
        scope,
        new Set(recorded.rows.map(row => String(row.grantKey))),
        lists.permissions,
        lists.scopeKeys,
    );

    if (plan.permissions.length !== stored.length) {
        await client.query(
            `UPDATE role SET permissions = $2, "updatedAt" = now() WHERE code = $1`,
            [roleCode, plan.permissions.join(',')],
        );
    }
    if (plan.scope && JSON.stringify(plan.scope) !== JSON.stringify(scope)) {
        await client.query(
            `UPDATE role_access_scope SET "accessScopeConfig" = $2, "updatedAt" = now() WHERE "roleCode" = $1`,
            [roleCode, JSON.stringify(plan.scope)],
        );
    }
    for (const grantKey of plan.record) {
        await client.query(
            `INSERT INTO role_default_grant ("roleCode", "grantKey") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [roleCode, grantKey],
        );
    }
    return plan.added;
}

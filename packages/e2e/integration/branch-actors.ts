import { adminTokenFor } from '../helpers/api-tokens';
import { select } from './contour-db';
import { envValue, loadContourEnv } from './contour-env';

export type ActorKey = 'manager-a' | 'manager-b' | 'head-a' | 'operator-a' | 'head-b' | 'director';
export type ScopeKind = 'own' | 'branch' | 'all';

export interface BranchActor {
    key: ActorKey;
    scope: ScopeKind;
    role: string;
}

// Roles only; logins and the fixture ERP ids live in the staging-integration env file, never in the repo.
export const ACTORS: BranchActor[] = [
    { key: 'manager-a', scope: 'own', role: 'manager' },
    { key: 'manager-b', scope: 'own', role: 'manager' },
    { key: 'head-a', scope: 'branch', role: 'department-head' },
    { key: 'operator-a', scope: 'branch', role: 'operator' },
    { key: 'head-b', scope: 'branch', role: 'department-head' },
    { key: 'director', scope: 'all', role: 'general-director' },
];

function list(name: string): string[] {
    return (envValue(`STAGING_FIXTURE_${name}_ERPIDS`) ?? '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

export const FIXTURES = {
    get branchA(): string[] {
        return list('BRANCH_A');
    },
    get branchB(): string[] {
        return list('BRANCH_B');
    },
    get noBranch(): string[] {
        return list('NO_BRANCH');
    },
    get inactive(): string[] {
        return list('INACTIVE');
    },
};

export function allFixtureErpIds(): string[] {
    const ids = [
        ...FIXTURES.branchA,
        ...FIXTURES.branchB,
        ...FIXTURES.noBranch,
        ...FIXTURES.inactive,
    ];
    if (FIXTURES.branchA.length < 2 || FIXTURES.branchB.length < 2 || FIXTURES.noBranch.length < 1)
        throw new Error(
            'STAGING_FIXTURE_{BRANCH_A,BRANCH_B,NO_BRANCH}_ERPIDS are missing in the staging-integration env file',
        );
    return ids;
}

export function actorCredentials(key: ActorKey): { username: string; password: string } | null {
    if (key === 'manager-a') return loadContourEnv().manager;
    const prefix = `STAGING_TEST_${key.toUpperCase().replace('-', '_')}`;
    const username = envValue(`${prefix}_USERNAME`);
    const password = envValue(`${prefix}_PASSWORD`);
    return username && password ? { username, password } : null;
}

export async function actorToken(key: ActorKey): Promise<string> {
    const credentials = actorCredentials(key);
    if (!credentials)
        throw new Error(`The ${key} login is missing in the staging-integration env file`);
    return adminTokenFor(credentials.username, credentials.password);
}

export interface ActorState {
    adminId: string;
    branchId: string | null;
    roles: string[];
}

export function actorState(actor: BranchActor): ActorState {
    const username = actorCredentials(actor.key)?.username;
    if (!username)
        throw new Error(`The ${actor.key} login is missing in the staging-integration env file`);
    const row = select<{ id: string; branchId: string | null; roles: string | null }>(
        `SELECT a.id::text AS id, a."customFieldsBranchid" AS "branchId",
                (SELECT string_agg(r.code, ',') FROM user_roles_role ur JOIN role r ON r.id = ur."roleId"
                 WHERE ur."userId" = a."userId") AS roles
         FROM administrator a WHERE a."emailAddress" = '${username.replace(/'/g, "''")}'`,
    )[0];
    if (!row) throw new Error(`The ${actor.key} administrator does not exist on the contour`);
    return { adminId: row.id, branchId: row.branchId, roles: (row.roles ?? '').split(',') };
}

// Mirrors the union of docs/access-control.md: own clients and team rows, active grants, and the branch.
export function expectedIds(actor: BranchActor, state: ActorState): Set<string> {
    const granted = `"assignedManagerId" IN (SELECT "subjectRef" FROM visibility_grant
        WHERE "granteeAdministratorId" = '${state.adminId}' AND "subjectKind" = 'manager' AND "revokedAt" IS NULL
        AND ("validFrom" IS NULL OR "validFrom" <= now()) AND ("validTo" IS NULL OR "validTo" > now()))`;
    const mine = `"assignedManagerId" = '${state.adminId}'`;
    const team = `id::text IN (SELECT "counterpartyId" FROM counterparty_team_member WHERE "administratorId" = '${state.adminId}')`;
    const where =
        actor.scope === 'all'
            ? 'TRUE'
            : actor.scope === 'own'
              ? `(${mine} OR ${team} OR ${granted})`
              : `(${state.branchId ? `"branchId" = '${state.branchId}' OR ` : ''}${mine} OR ${granted})`;
    return new Set(
        select<{ id: string }>(`SELECT id::text AS id FROM counterparty WHERE ${where}`).map(
            r => r.id,
        ),
    );
}

export function fixtureIds(erpIds: string[]): string[] {
    const list = erpIds.map(e => `'${e}'`).join(',');
    return select<{ id: string }>(
        `SELECT id::text AS id FROM counterparty WHERE "erpId" IN (${list}) ORDER BY id`,
    ).map(r => r.id);
}

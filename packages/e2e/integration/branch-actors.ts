import { adminTokenFor } from '../helpers/api-tokens';
import { select } from './contour-db';
import { envValue, loadContourEnv } from './contour-env';

export type ActorKey =
    | 'mishin'
    | 'malyshev'
    | 'plekhanova'
    | 'medentsev'
    | 'verevkina'
    | 'pogoreltsev';
export type ScopeKind = 'own' | 'branch' | 'all';

export interface BranchActor {
    key: ActorKey;
    scope: ScopeKind;
    role: string;
    email: string;
}

// Fixed fixtures of the contour (issue #262); the scope each role must have is checked against the DB too.
export const ACTORS: BranchActor[] = [
    { key: 'mishin', scope: 'own', role: 'manager', email: 'mishin.test@example.com' },
    { key: 'verevkina', scope: 'own', role: 'manager', email: 'verevkina.test@example.com' },
    {
        key: 'malyshev',
        scope: 'branch',
        role: 'department-head',
        email: 'malyshev.test@example.com',
    },
    { key: 'plekhanova', scope: 'branch', role: 'operator', email: 'plekhanova.test@example.com' },
    {
        key: 'medentsev',
        scope: 'branch',
        role: 'department-head',
        email: 'medentsev.test@example.com',
    },
    {
        key: 'pogoreltsev',
        scope: 'all',
        role: 'general-director',
        email: 'pogoreltsev.test@example.com',
    },
];

export const FIXTURES = {
    branchA: ['8c4f416b-c192-11e1-8a03-f46d0490adee', '8c4f41aa-c192-11e1-8a03-f46d0490adee'],
    branchB: ['c9c66220-45a2-11e2-bda5-f46d0490adee', '027028bf-372a-11e4-8c55-64700210df32'],
    noBranch: ['be68b8f2-c192-11e1-8a03-f46d0490adee'],
    inactive: ['7f382ccb-58e0-11ed-a023-da2dec3fdf49', '2cc91e61-87ac-11e7-a3f6-00155d28010b'],
};

export function actorCredentials(key: ActorKey): { username: string; password: string } | null {
    if (key === 'mishin') return loadContourEnv().manager;
    const prefix = `STAGING_TEST_${key.toUpperCase()}`;
    const username = envValue(`${prefix}_USERNAME`);
    const password = envValue(`${prefix}_PASSWORD`);
    return username && password ? { username, password } : null;
}

export async function actorToken(key: ActorKey): Promise<string> {
    const credentials = actorCredentials(key);
    if (!credentials)
        throw new Error(
            `STAGING_TEST_${key.toUpperCase()}_* is missing in the staging-integration env file`,
        );
    return adminTokenFor(credentials.username, credentials.password);
}

export interface ActorState {
    adminId: string;
    branchId: string | null;
    roles: string[];
}

export function actorState(actor: BranchActor): ActorState {
    const row = select<{ id: string; branchId: string | null; roles: string | null }>(
        `SELECT a.id::text AS id, a."customFieldsBranchid" AS "branchId",
                (SELECT string_agg(r.code, ',') FROM user_roles_role ur JOIN role r ON r.id = ur."roleId"
                 WHERE ur."userId" = a."userId") AS roles
         FROM administrator a WHERE a."emailAddress" = '${actor.email}'`,
    )[0];
    if (!row) throw new Error(`Administrator ${actor.email} does not exist on the contour`);
    return { adminId: row.id, branchId: row.branchId, roles: (row.roles ?? '').split(',') };
}

// The rows the actor must see, derived from the contour data and the scope rules, never hardcoded.
export function expectedIds(actor: BranchActor, state: ActorState): Set<string> {
    const where =
        actor.scope === 'all'
            ? 'TRUE'
            : actor.scope === 'own'
              ? `"assignedManagerId" = '${state.adminId}'`
              : state.branchId
                ? `"branchId" = '${state.branchId}'`
                : 'FALSE';
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

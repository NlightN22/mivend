import { select } from './contour-db';
import { envValue, loadContourEnv } from './contour-env';
import {
    actorState,
    ACTORS,
    type ActorKey,
    type ActorState,
    type BranchActor,
} from './branch-actors';

export interface SamplePoint {
    id: string;
    counterpartyId: string;
    label: string;
}

const DEFAULT = `(SELECT "customFieldsDefaultbranchid" FROM global_settings LIMIT 1)`;
// Read-time branch of docs/access-control.md: point override, else counterparty branch, else the default.
const BRANCH = `COALESCE(tp."servicingBranchId", cp."branchId", ${DEFAULT})`;

// Every point of the fixture counterparties plus the lowest-id point of one branch-less client.
export function samplePoints(fixtureCounterparties: string[]): SamplePoint[] {
    const list = fixtureCounterparties.join(',');
    return select<SamplePoint>(`(SELECT tp.id::text AS id, tp."counterpartyId"::text AS "counterpartyId",
            'counterparty branch ' || coalesce(cp."branchId", 'none') AS label
        FROM trading_point tp JOIN counterparty cp ON cp.id = tp."counterpartyId"
        WHERE cp.id IN (${list}))
        UNION ALL (SELECT tp.id::text, tp."counterpartyId"::text, 'branch-less client'
        FROM trading_point tp JOIN counterparty cp ON cp.id = tp."counterpartyId"
        WHERE cp."branchId" IS NULL AND tp."servicingBranchId" IS NULL ORDER BY tp.id LIMIT 1)`);
}

export function expectedPointIds(
    actor: BranchActor,
    state: ActorState,
    visibleCounterparties: Set<string>,
    points: SamplePoint[],
): Set<string> {
    if (actor.scope === 'all') return new Set(points.map(p => p.id));
    const rows = select<{ id: string; branch: string | null; cp: string }>(
        `SELECT tp.id::text AS id, ${BRANCH} AS branch, cp.id::text AS cp
         FROM trading_point tp JOIN counterparty cp ON cp.id = tp."counterpartyId"
         WHERE tp.id IN (${points.map(p => p.id).join(',')})`,
    );
    return new Set(
        rows
            .filter(
                r =>
                    visibleCounterparties.has(r.cp) ||
                    (actor.scope === 'branch' && !!state.branchId && r.branch === state.branchId),
            )
            .map(r => r.id),
    );
}

export interface PointRow {
    name: string;
    deliveryComment: string | null;
    isActive: boolean;
    customerStatus: string;
    servicingBranchId: string | null;
    contacts: string;
}

export function pointRow(id: string): PointRow {
    return select<PointRow>(`SELECT tp.name, tp."deliveryComment", tp."isActive", tp."customerStatus",
            tp."servicingBranchId",
            coalesce((SELECT string_agg(c.name || '|' || coalesce(c.phone, '') || '|' ||
                coalesce(c.email, '') || '|' || c."isPrimary", ',' ORDER BY c.name)
                FROM contact_person c WHERE c."tradingPointId" = tp.id), '') AS contacts
        FROM trading_point tp WHERE tp.id = ${Number(id)}`)[0];
}

export function pointsOf(counterpartyId: string): string[] {
    return select<{ id: string }>(
        `SELECT id::text AS id FROM trading_point WHERE "counterpartyId" = ${Number(counterpartyId)} ORDER BY id`,
    ).map(r => r.id);
}

export function branchOf(key: ActorKey): string | null {
    return actorState(ACTORS.find(a => a.key === key)!).branchId;
}

export interface ShopCustomer {
    label: string;
    login: { email: string; password: string } | null;
}

export function shopCustomers(): ShopCustomer[] {
    const emailB = envValue('STAGING_TEST_CUSTOMER_B_EMAIL');
    const passwordB = envValue('STAGING_TEST_CUSTOMER_B_PASSWORD');
    return [
        { label: 'branch-a customer', login: loadContourEnv().customer },
        {
            label: 'branch-b customer',
            login: emailB && passwordB ? { email: emailB, password: passwordB } : null,
        },
    ];
}

export function preferredPoint(email: string): string | null {
    return select<{ p: string | null }>(
        `SELECT "customFieldsPreferredtradingpointid" AS p FROM customer
         WHERE "emailAddress" = '${email.replace(/'/g, "''")}'`,
    )[0].p;
}

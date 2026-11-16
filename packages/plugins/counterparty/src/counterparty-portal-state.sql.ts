import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

// The state of the counterparty's portal account (#375), not the activation readiness.
export const PORTAL_STATES = ['none', 'invited', 'verified', 'active'] as const;
export type PortalState = (typeof PORTAL_STATES)[number];

// The live login: the non-deleted portal customer whose user is not deleted either.
const LOGIN = `FROM customer cu JOIN "user" u ON u.id = cu."userId" AND u."deletedAt" IS NULL
    WHERE cu."customFieldsCounterpartyid"::text = c.id::text AND cu."deletedAt" IS NULL`;
const PASSWORD_SET = `EXISTS (SELECT 1 FROM authentication_method am WHERE am."userId" = u.id
    AND am.type = 'NativeAuthenticationMethod' AND am."passwordHash" <> '')`;

const FRAGMENTS: Record<PortalState, string> = {
    none: `NOT EXISTS (SELECT 1 ${LOGIN})`,
    active: `EXISTS (SELECT 1 ${LOGIN} AND u."lastLogin" IS NOT NULL)`,
    verified: `EXISTS (SELECT 1 ${LOGIN} AND u."lastLogin" IS NULL AND u.verified AND ${PASSWORD_SET})`,
    invited: `EXISTS (SELECT 1 ${LOGIN} AND u."lastLogin" IS NULL AND NOT (u.verified AND ${PASSWORD_SET}))`,
};

export const PORTAL_STATE_CASE_SQL = `CASE ${PORTAL_STATES.map(s => `WHEN ${FRAGMENTS[s]} THEN '${s}'`).join(' ')} END`;

// Orders none < invited < verified < active, as a selected alias for sorting.
export const PORTAL_STATE_RANK_SQL = `CASE ${PORTAL_STATES.map((s, i) => `WHEN ${FRAGMENTS[s]} THEN ${i}`).join(' ')} END`;

export async function loadPortalStates(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    counterpartyIds: readonly string[],
): Promise<Map<string, PortalState>> {
    const rows = await ctxQuery<Array<{ id: string; state: PortalState }>>(
        connection,
        ctx,
        `SELECT c.id::text AS id, ${PORTAL_STATE_CASE_SQL} AS state FROM counterparty c
         WHERE c.id = ANY($1::int[])`,
        [counterpartyIds.map(Number)],
    );
    return new Map(rows.map(r => [r.id, r.state]));
}

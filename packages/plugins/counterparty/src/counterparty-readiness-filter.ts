import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

import { hasChosenChannelSql } from './counterparty-chosen-contact.sql';
import { INN_DIGITS_SQL, innDigitsSql } from './counterparty-inn-guard';

export const PORTAL_READINESS = [
    'ready',
    'missing-data',
    'inn-duplicate',
    'erp-inactive',
    'activated',
] as const;
export type PortalReadiness = (typeof PORTAL_READINESS)[number];

const linkedSql = (alias: string): string => `EXISTS (SELECT 1 FROM customer cu
    WHERE cu."customFieldsCounterpartyid"::text = ${alias}.id::text AND cu."deletedAt" IS NULL)`;
const LINKED = linkedSql('c');
const HAS_CONTACTS = `${hasChosenChannelSql('phone')} AND ${hasChosenChannelSql('email')}`;
const HAS_INN = `${INN_DIGITS_SQL} <> ''`;
// Matches findLinkedInnDuplicate: another active holder of the same digits that has a live portal Customer.
const INN_DUPLICATE = `EXISTS (SELECT 1 FROM counterparty d WHERE d.id <> c.id AND d."isActive" = true
    AND ${innDigitsSql('d')} = ${INN_DIGITS_SQL} AND ${linkedSql('d')})`;

const BINDABLE = `NOT ${LINKED} AND c."isActive" = true`;

// Linked is tested first; for unlinked rows the order (inactive, contacts, INN, duplicate) is the executor's.
const FRAGMENTS: Record<PortalReadiness, string> = {
    activated: LINKED,
    'erp-inactive': `NOT ${LINKED} AND c."isActive" = false`,
    'missing-data': `${BINDABLE} AND (NOT (${HAS_CONTACTS}) OR NOT (${HAS_INN}))`,
    'inn-duplicate': `${BINDABLE} AND (${HAS_CONTACTS}) AND ${HAS_INN} AND ${INN_DUPLICATE}`,
    ready: `${BINDABLE} AND (${HAS_CONTACTS}) AND ${HAS_INN} AND NOT ${INN_DUPLICATE}`,
};

export function portalReadinessSql(readiness: string): string {
    if (!Object.prototype.hasOwnProperty.call(FRAGMENTS, readiness)) {
        throw new UserInputError(`Unknown readiness filter: ${readiness}`);
    }
    return FRAGMENTS[readiness as PortalReadiness];
}

const READINESS_CASE_SQL = `CASE ${PORTAL_READINESS.map(r => `WHEN ${FRAGMENTS[r]} THEN '${r}'`).join(' ')} END`;

export async function loadPortalReadiness(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    counterpartyIds: readonly string[],
): Promise<Map<string, PortalReadiness>> {
    const rows = await ctxQuery<Array<{ id: string; readiness: PortalReadiness }>>(
        connection,
        ctx,
        `SELECT c.id::text AS id, ${READINESS_CASE_SQL} AS readiness FROM counterparty c
         WHERE c.id = ANY($1::int[])`,
        [counterpartyIds.map(Number)],
    );
    return new Map(rows.map(r => [r.id, r.readiness]));
}

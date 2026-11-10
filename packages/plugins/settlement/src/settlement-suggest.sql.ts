import type { SuggestSpec } from 'shared';

import { INTERNAL_CATEGORIES } from './settlement-visibility';

const INTERNAL = INTERNAL_CATEGORIES.map(c => `'${c}'`).join(', ');
const LISTABLE_CATEGORY = `COALESCE("st"."category", 'other') NOT IN (${INTERNAL})`;
const CUSTOMER_CONTRACT_OF = (entry: string): string => `${entry}."contractId" IN (
    SELECT "sk"."id"::text FROM "contract" "sk"
    WHERE "sk"."counterpartyId" = ${entry}."counterpartyId" AND "sk"."isCustomerContract" IS TRUE)`;
const DOCUMENT_JOINS = `JOIN "settlement_document" "sd" ON "sd"."id" = "se"."documentId" AND NOT "sd"."isDeleted"
    LEFT JOIN "settlement_document_type" "st" ON "st"."documentType" = "sd"."documentType" AND NOT "st"."isDeleted"`;

// A scalar subselect, not EXISTS: the planner would flatten EXISTS into a hash join over every entry.
const HAS_LISTABLE_ENTRY = (entryMatch: string): string => `(SELECT 1 FROM "settlement_document_entry" "se"
    ${DOCUMENT_JOINS} WHERE ${entryMatch} AND ${LISTABLE_CATEGORY} LIMIT 1) IS NOT NULL`;

// Outer aliases: "cp" counterparty, "d" document (joined to its entry "e" and type "st").
export const SUGGEST_CUSTOMER: SuggestSpec = {
    valueSql: '"cp"."shortName"',
    whereSql: HAS_LISTABLE_ENTRY(`"se"."counterpartyId" = "cp"."id"::text
        AND ${CUSTOMER_CONTRACT_OF('"se"')}`),
};

export const SUGGEST_NUMBER: SuggestSpec = {
    valueSql: '"d"."number"',
    repeats: true,
    whereSql: `NOT "d"."isDeleted" AND ${LISTABLE_CATEGORY} AND ${CUSTOMER_CONTRACT_OF('"e"')}`,
};

import { UserInputError } from '@vendure/core';

export const PORTAL_READINESS = ['ready', 'missing-data', 'erp-inactive', 'activated'] as const;
export type PortalReadiness = (typeof PORTAL_READINESS)[number];

const LINKED = `EXISTS (SELECT 1 FROM customer cu
    WHERE cu."customFieldsCounterpartyid"::text = c.id::text AND cu."deletedAt" IS NULL)`;
const HAS_CONTACTS = `coalesce(c.phone, '') <> '' AND coalesce(c."officialEmail", '') <> ''`;

// Same precedence as the manager portal's activationReadiness: activated, ERP inactive, missing data.
export function portalReadinessSql(readiness: string): string {
    switch (readiness) {
        case 'activated':
            return LINKED;
        case 'erp-inactive':
            return `NOT ${LINKED} AND c."isActive" = false`;
        case 'missing-data':
            return `NOT ${LINKED} AND c."isActive" = true AND NOT (${HAS_CONTACTS})`;
        case 'ready':
            return `NOT ${LINKED} AND c."isActive" = true AND ${HAS_CONTACTS}`;
        default:
            throw new UserInputError(`Unknown readiness filter: ${readiness}`);
    }
}

import { adminApi } from './client';

export interface EntityVersionRow {
    id: string;
    entityName: string;
    entityId: string;
    action: string;
    changedFields: string | null;
    administratorId: string | null;
    comment: string | null;
    createdAt: string;
}

// Gated on CustomPermission.ReadEntityHistory (leadership roles only — department-head,
// general-director, security-officer, portal-admin) — see infrastructure/scripts/
// seed-access-roles.mjs. Generic across entity types by design (see plugin-versioning) —
// entityName/entityId is the only thing that varies per caller.
export async function fetchEntityVersions(
    entityName: string,
    entityId: string,
): Promise<EntityVersionRow[]> {
    const result = await adminApi<{ entityVersions: EntityVersionRow[] }>(
        `query($entityName: String!, $entityId: ID!) {
            entityVersions(entityName: $entityName, entityId: $entityId) {
                id
                entityName
                entityId
                action
                changedFields
                administratorId
                comment
                createdAt
            }
        }`,
        { entityName, entityId },
    );
    return result.entityVersions;
}

export interface EntityRef {
    entityName: string;
    entityId: string;
}

// Batch variant of fetchEntityVersions — one request for a whole object graph's audit trail
// (e.g. a Counterparty plus all of its TradingPoints) instead of one call per ref, so the
// History widget scales to any entity/relation shape without an N+1 waterfall on load.
export async function fetchEntityVersionsForRefs(refs: EntityRef[]): Promise<EntityVersionRow[]> {
    if (refs.length === 0) return [];
    const result = await adminApi<{ entityVersionsForEntities: EntityVersionRow[] }>(
        `query($refs: [EntityRefInput!]!) {
            entityVersionsForEntities(refs: $refs) {
                id
                entityName
                entityId
                action
                changedFields
                administratorId
                comment
                createdAt
            }
        }`,
        { refs },
    );
    return result.entityVersionsForEntities;
}

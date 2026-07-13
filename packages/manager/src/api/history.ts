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

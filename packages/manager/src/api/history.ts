import { adminApi } from './client';
import {
    EntityVersionsDocument,
    EntityVersionsForEntitiesDocument,
    type EntityVersionRowFieldsFragment,
} from './generated/graphql';

export type EntityVersionRow = EntityVersionRowFieldsFragment;

// Requires CustomPermission.ReadEntityHistory (leadership roles, seeded in seed-access-roles.mjs).
// Generic across entity types: entityName/entityId is the only per-caller variable.
export async function fetchEntityVersions(
    entityName: string,
    entityId: string,
): Promise<EntityVersionRow[]> {
    const result = await adminApi(EntityVersionsDocument, { entityName, entityId });
    return result.entityVersions;
}

export interface EntityRef {
    entityName: string;
    entityId: string;
}

// Mirrors the backend EntityVersionListOptions; these filters are pushed into SQL columns.
// Free-text search is intentionally absent: EntityHistoryPanel.vue only filters the loaded page.
export interface EntityVersionListOptions {
    take?: number;
    skip?: number;
    action?: string;
    entityName?: string;
    administratorId?: string;
    system?: boolean;
    createdAfter?: string;
}

export interface EntityVersionPage {
    items: EntityVersionRow[];
    totalItems: number;
}

// Batched to fetch a whole object graph in one request, avoiding an N+1 load waterfall.
// Paginated and filtered server-side; filter changes refetch rather than filter in memory.
export async function fetchEntityVersionsForRefs(
    refs: EntityRef[],
    options: EntityVersionListOptions = {},
): Promise<EntityVersionPage> {
    if (refs.length === 0) return { items: [], totalItems: 0 };
    const result = await adminApi(EntityVersionsForEntitiesDocument, { refs, options });
    return result.entityVersionsForEntities;
}

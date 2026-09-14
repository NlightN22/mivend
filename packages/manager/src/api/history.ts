import { adminApi } from './client';
import {
    EntityVersionsDocument,
    EntityVersionsForEntitiesDocument,
    type EntityVersionRowFieldsFragment,
} from './generated/graphql';

export type EntityVersionRow = EntityVersionRowFieldsFragment;

// Gated on CustomPermission.ReadEntityHistory (leadership roles only — department-head,
// general-director, security-officer, portal-admin) — see infrastructure/scripts/
// seed-access-roles.mjs. Generic across entity types by design (see plugin-versioning) —
// entityName/entityId is the only thing that varies per caller.
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

// Mirrors the backend's EntityVersionListOptions (plugin-versioning) — action/entityName/
// administratorId/createdAfter are real columns, pushed into SQL. Free-text search is NOT here —
// EntityHistoryPanel.vue's search field only matches within the currently-loaded page, same
// documented limitation as Approvals' search (see issue #39).
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

// Batch variant of fetchEntityVersions — one request for a whole object graph's audit trail
// (e.g. a Counterparty plus all of its TradingPoints) instead of one call per ref, so the
// History widget scales to any entity/relation shape without an N+1 waterfall on load.
// Server-side paginated + filtered (issue #39) — see EntityHistoryPanel.vue for how filter state
// drives a refetch instead of filtering a fully-loaded array in memory.
export async function fetchEntityVersionsForRefs(
    refs: EntityRef[],
    options: EntityVersionListOptions = {},
): Promise<EntityVersionPage> {
    if (refs.length === 0) return { items: [], totalItems: 0 };
    const result = await adminApi(EntityVersionsForEntitiesDocument, { refs, options });
    return result.entityVersionsForEntities;
}

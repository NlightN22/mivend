import type { RequestContext } from '@vendure/core';
import type { Permission } from '@vendure/common/lib/generated-types';

export const loggerCtx = 'StaffSearchPlugin';

export interface GlobalSearchHit {
    id: string;
    number: string;
    title: string;
    subtitle: string | null;
    status: string | null;
    counterpartyId: string | null;
}

// `permissions` follow @Allow semantics (any one suffices); `search` must apply the same scope as the entity's list.
export interface GlobalSearchProvider {
    kind: string;
    position: number;
    permissions: Permission[];
    search(ctx: RequestContext, term: string, limit: number): Promise<GlobalSearchHit[]>;
}

export interface GlobalSearchGroup {
    kind: string;
    items: GlobalSearchHit[];
}

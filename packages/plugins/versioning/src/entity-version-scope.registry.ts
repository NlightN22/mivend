import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';

import type { EntityRef } from './versioning.service';

// Returns the subset of ids the caller may see for one entity type.
export type EntityVisibilityFilter = (ctx: RequestContext, ids: string[]) => Promise<Set<string>>;

// Owning plugins register their scope rule here, so versioning never imports them.
// An entity name without a rule is visible only to callers with counterparty scope 'all'.
@Injectable()
export class EntityVersionScopeRegistry {
    private readonly filters = new Map<string, EntityVisibilityFilter>();

    constructor(private readonly accessScope: AccessScopeService) {}

    register(entityName: string, filter: EntityVisibilityFilter): void {
        this.filters.set(entityName, filter);
    }

    async filterRefs<T extends EntityRef>(ctx: RequestContext, refs: T[]): Promise<T[]> {
        const idsByName = new Map<string, string[]>();
        for (const ref of refs) {
            const ids = idsByName.get(ref.entityName) ?? [];
            ids.push(String(ref.entityId));
            idsByName.set(ref.entityName, ids);
        }
        const visible = new Map<string, Set<string>>();
        let unrestricted: boolean | undefined;
        for (const [name, ids] of idsByName) {
            const filter = this.filters.get(name);
            if (filter) {
                visible.set(name, await filter(ctx, [...new Set(ids)]));
                continue;
            }
            unrestricted ??= (await this.accessScope.resolveCounterpartyScope(ctx)).kind === 'all';
            visible.set(name, unrestricted ? new Set(ids) : new Set());
        }
        return refs.filter(r => visible.get(r.entityName)?.has(String(r.entityId)));
    }
}

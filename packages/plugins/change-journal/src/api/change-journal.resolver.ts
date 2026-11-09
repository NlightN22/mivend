import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import { EntityVersionScopeRegistry } from '@mivend/plugin-versioning';

import { ChangeJournalService } from '../change-journal.service';
import type { ChangeJournalFilter, ChangeJournalPage, PageArgs } from '../change-journal.service';

const EMPTY: ChangeJournalPage = { items: [], totalItems: 0 };

// Same per-entity rules as entity history; the cross-entity list needs counterparty scope 'all'.
@Resolver()
export class ChangeJournalResolver {
    constructor(
        private journal: ChangeJournalService,
        private scopeRegistry: EntityVersionScopeRegistry,
        private accessScope: AccessScopeService,
    ) {}

    @Query()
    @Allow(CustomPermission.ReadChangeJournal.Permission)
    async changeJournalForEntity(
        @Ctx() ctx: RequestContext,
        @Args() args: { entityType: string; entityId: string } & PageArgs,
    ): Promise<ChangeJournalPage> {
        const ref = { entityName: args.entityType, entityId: String(args.entityId) };
        const allowed = await this.scopeRegistry.filterRefs(ctx, [ref]);
        if (allowed.length === 0) return EMPTY;
        return this.journal.findForEntity(ctx, ref.entityName, ref.entityId, args);
    }

    @Query()
    @Allow(CustomPermission.ReadChangeJournal.Permission)
    async changeJournal(
        @Ctx() ctx: RequestContext,
        @Args() args: { filter?: ChangeJournalFilter | null } & PageArgs,
    ): Promise<ChangeJournalPage> {
        const scope = await this.accessScope.resolveCounterpartyScope(ctx);
        if (scope.kind !== 'all') return EMPTY;
        return this.journal.findFiltered(ctx, args.filter ?? {}, args);
    }
}

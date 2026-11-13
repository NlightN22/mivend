import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ForbiddenError, RequestContext } from '@vendure/core';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import { EntityVersionScopeRegistry } from '@mivend/plugin-versioning';

import { ChangeJournalService } from '../change-journal.service';
import type { ChangeJournalFilter, ChangeJournalPage, PageArgs } from '../change-journal.service';

// Same per-entity rules as entity history; the cross-entity list needs counterparty scope 'all'.
// A refusal is one ForbiddenError whether or not the entity exists (#340).
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
        @Args()
        args: { entityType: string; entityId: string; filter?: ChangeJournalFilter | null } & PageArgs,
    ): Promise<ChangeJournalPage> {
        const ref = { entityName: args.entityType, entityId: String(args.entityId) };
        const allowed = await this.scopeRegistry.filterRefs(ctx, [ref]);
        if (allowed.length === 0) throw new ForbiddenError();
        return this.journal.findForEntity(
            ctx,
            ref.entityName,
            ref.entityId,
            args,
            args.filter ?? {},
        );
    }

    @Query()
    @Allow(CustomPermission.ReadChangeJournal.Permission)
    async changeJournal(
        @Ctx() ctx: RequestContext,
        @Args() args: { filter?: ChangeJournalFilter | null } & PageArgs,
    ): Promise<ChangeJournalPage> {
        const scope = await this.accessScope.resolveCounterpartyScope(ctx);
        if (scope.kind !== 'all') throw new ForbiddenError();
        return this.journal.findFiltered(ctx, args.filter ?? {}, args);
    }
}

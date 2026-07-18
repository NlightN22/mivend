import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyTeamMember } from './entities/counterparty-team-member.entity';
import { CounterpartyTeamService } from './counterparty-team.service';

// A counterparty's team is a structurally small/bounded list (Owner + a handful of
// backup/observer members) — no pagination needed here, see AGENTS.md's pagination-rule
// exemption for genuinely bounded lists.
@Resolver('Counterparty')
export class CounterpartyTeamFieldResolver {
    constructor(private counterpartyTeamService: CounterpartyTeamService) {}

    @ResolveField()
    async teamMembers(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<CounterpartyTeamMember[]> {
        return this.counterpartyTeamService.getTeamMembers(ctx, counterparty.id);
    }
}

@Resolver()
export class CounterpartyTeamMutationResolver {
    constructor(private counterpartyTeamService: CounterpartyTeamService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageCounterpartyTeam.Permission)
    async addCounterpartyTeamMember(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string; administratorId: string; role: string },
    ): Promise<CounterpartyTeamMember> {
        return this.counterpartyTeamService.addTeamMember(
            ctx,
            args.counterpartyId,
            args.administratorId,
            args.role as 'backup' | 'observer',
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageCounterpartyTeam.Permission)
    async removeCounterpartyTeamMember(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string; administratorId: string },
    ): Promise<boolean> {
        return this.counterpartyTeamService.removeTeamMember(
            ctx,
            args.counterpartyId,
            args.administratorId,
        );
    }
}

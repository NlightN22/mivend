import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyTeamMember } from './entities/counterparty-team-member.entity';
import { CounterpartyTeamService } from './counterparty-team.service';
import { CounterpartyService } from './counterparty.service';
import { hiddenOnAdmin } from './hidden-on-admin';

// A counterparty's team is structurally bounded (Owner + a few backup/observer members),
// so no pagination; see the backend-plugin-rules pagination exemption for bounded lists.
@Resolver('Counterparty')
export class CounterpartyTeamFieldResolver {
    constructor(
        private counterpartyTeamService: CounterpartyTeamService,
        private counterpartyService: CounterpartyService,
    ) {}

    @ResolveField()
    async teamMembers(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<CounterpartyTeamMember[]> {
        if (await hiddenOnAdmin(this.counterpartyService, ctx, counterparty.id)) return [];
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
        @Args()
        args: {
            counterpartyId: string;
            administratorId: string;
            role: string;
            phone?: string | null;
        },
    ): Promise<CounterpartyTeamMember> {
        return this.counterpartyTeamService.addTeamMember(
            ctx,
            args.counterpartyId,
            args.administratorId,
            args.role as 'backup' | 'observer' | 'accounting-contact',
            args.phone,
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

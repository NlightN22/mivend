import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Customer, RequestContext, Transaction, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { Counterparty } from './entities/counterparty.entity';
import {
    CounterpartyPortalAccessService,
    PortalAccessChangeInput,
    PortalAccessChangeResult,
} from './counterparty-portal-access.service';

function toPortalAccessChanges(
    raw: Array<{ counterpartyId: ID; action: string }>,
): PortalAccessChangeInput[] {
    return raw.map(change => {
        if (change.action !== 'activate' && change.action !== 'deactivate') {
            throw new UserInputError(`Invalid portal access action: ${change.action}`);
        }
        return { counterpartyId: change.counterpartyId, action: change.action };
    });
}

// A counterparty's own portal-user list is a structurally small/bounded set (client_admin +
// a handful of sub-roles), same pagination-exemption reasoning as CounterpartyTeamMember.
@Resolver('Counterparty')
export class CounterpartyPortalAccessFieldResolver {
    constructor(private portalAccessService: CounterpartyPortalAccessService) {}

    @ResolveField()
    @Allow(CustomPermission.ManageCounterpartyPortalAccess.Permission)
    async portalUsers(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<Customer[]> {
        return this.portalAccessService.findPortalUsers(ctx, counterparty.id);
    }
}

@Resolver()
export class CounterpartyPortalAccessMutationResolver {
    constructor(private portalAccessService: CounterpartyPortalAccessService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageCounterpartyPortalAccess.Permission)
    async activateCounterpartyPortalAccess(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID },
    ): Promise<Customer> {
        return this.portalAccessService.activate(ctx, args.counterpartyId);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageCounterpartyPortalAccess.Permission)
    async deactivateCounterpartyPortalAccess(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerId: ID },
    ): Promise<Customer> {
        return this.portalAccessService.deactivate(ctx, args.customerId);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageCounterpartyPortalAccess.Permission)
    async applyCounterpartyPortalAccessChanges(
        @Ctx() ctx: RequestContext,
        @Args() args: { changes: Array<{ counterpartyId: ID; action: string }> },
    ): Promise<PortalAccessChangeResult[]> {
        return this.portalAccessService.applyBatch(ctx, toPortalAccessChanges(args.changes));
    }
}

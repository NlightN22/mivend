import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission, UnsortedAdministratorService } from '@mivend/plugin-access-control';

import { PriceTypeGapService } from '../price-type-gap.service';
import { UnsortedCounterpartyService } from './unsorted-counterparty.service';
import {
    VisibilityGrantListArgs,
    VisibilityGrantQueryService,
    VisibilityGrantRow,
} from './visibility-grant-query.service';
import { VisibilityGrantService } from './visibility-grant.service';

const MANAGE = CustomPermission.ManageVisibilityGrants.Permission;
const MANAGE_ACCESS = CustomPermission.ManageAccessControl.Permission;

@Resolver()
export class VisibilityResolver {
    constructor(
        private grants: VisibilityGrantService,
        private query: VisibilityGrantQueryService,
        private counterpartiesService: UnsortedCounterpartyService,
        private administratorsService: UnsortedAdministratorService,
        private priceTypeGaps: PriceTypeGapService,
    ) {}

    @Query()
    @Allow(MANAGE, MANAGE_ACCESS)
    visibilityGrants(@Ctx() ctx: RequestContext, @Args() args: VisibilityGrantListArgs) {
        return this.query.findPage(ctx, args);
    }

    @Query()
    @Allow(MANAGE, MANAGE_ACCESS)
    async visibilityGrantCandidates(
        @Ctx() ctx: RequestContext,
    ): Promise<Array<{ id: string; firstName: string; lastName: string }>> {
        const admins = await this.query.findCandidates(ctx);
        return admins.map(a => ({
            id: String(a.id),
            firstName: a.firstName,
            lastName: a.lastName,
        }));
    }

    @Query()
    @Allow(MANAGE, MANAGE_ACCESS)
    unsortedCounterparties(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number; skip?: number; search?: string },
    ) {
        return this.counterpartiesService.findPage(ctx, args);
    }

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    priceTypeGapCounterparties(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number; skip?: number; search?: string },
    ) {
        return this.priceTypeGaps.findPage(ctx, args);
    }

    @Query()
    @Allow(MANAGE, MANAGE_ACCESS)
    async unsortedAdministrators(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number; skip?: number },
    ) {
        const page = await this.administratorsService.findPage(ctx, args);
        return {
            totalItems: page.totalItems,
            items: page.items.map(a => ({
                id: String(a.id),
                firstName: a.firstName,
                lastName: a.lastName,
                emailAddress: a.emailAddress,
                departmentId:
                    (a.customFields as { departmentId?: string | null } | undefined)
                        ?.departmentId ?? null,
                roleCodes: a.user?.roles?.map(r => r.code) ?? [],
            })),
        };
    }

    @Transaction()
    @Mutation()
    @Allow(MANAGE, MANAGE_ACCESS)
    async grantManagerVisibility(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            granteeAdministratorId: ID;
            managerAdministratorId: ID;
            validFrom?: Date | null;
            validTo?: Date | null;
            reason: string;
        },
    ): Promise<VisibilityGrantRow> {
        const row = await this.grants.grant(ctx, args);
        return this.single(ctx, row.id);
    }

    @Transaction()
    @Mutation()
    @Allow(MANAGE, MANAGE_ACCESS)
    async revokeVisibilityGrant(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; reason?: string | null },
    ): Promise<VisibilityGrantRow> {
        const row = await this.grants.revoke(ctx, args.id, args.reason);
        return this.single(ctx, row.id);
    }

    private async single(ctx: RequestContext, id: ID): Promise<VisibilityGrantRow> {
        return this.query.findOne(ctx, id);
    }
}

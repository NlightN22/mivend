import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { CustomPermission, PriceTypeAccessService } from '@mivend/plugin-access-control';
import { CounterpartyService, ContractService } from '@mivend/plugin-counterparty';

import { accrualKindLabel } from './accrual-kind-label';
import { RetroBonusRule } from './retro-bonus-rule.entity';
import { RetroBonusRuleService } from './retro-bonus-rule.service';

@Resolver('RetroBonusRule')
export class RetroBonusRuleAccrualKindResolver {
    @ResolveField()
    accrualKindLabel(@Parent() rule: RetroBonusRule): string {
        return accrualKindLabel(rule.accrualKind);
    }
}

// Null when the viewer may not see that price type (deny by default).
@Resolver('RetroBonusRule')
export class RetroBonusRulePriceTypeResolver {
    constructor(private priceTypeAccess: PriceTypeAccessService) {}

    @ResolveField()
    async priceTypeErpId(
        @Ctx() ctx: RequestContext,
        @Parent() rule: RetroBonusRule,
    ): Promise<string | null> {
        return (await this.priceTypeAccess.isExternalIdAllowed(ctx, rule.priceTypeErpId))
            ? rule.priceTypeErpId
            : null;
    }
}

@Resolver()
export class RetroBonusRuleResolver {
    constructor(
        private retroBonusRuleService: RetroBonusRuleService,
        private counterpartyService: CounterpartyService,
        private contractService: ContractService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async retroBonusRules(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID; contractId?: ID },
    ): Promise<RetroBonusRule[]> {
        const counterparty = await this.counterpartyService.findOneVisible(
            ctx,
            args.counterpartyId,
        );
        if (!counterparty) return [];

        let contractErpId: string | undefined;
        if (args.contractId) {
            const contract = await this.contractService.findById(ctx, args.contractId);
            if (!contract) return [];
            contractErpId = contract.erpId;
        }

        return this.retroBonusRuleService.findForCounterparty(
            ctx,
            counterparty.erpId,
            contractErpId,
        );
    }
}

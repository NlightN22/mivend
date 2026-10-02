import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService, ContractService } from '@mivend/plugin-counterparty';

import { RetroBonusAccrualKind, RetroBonusRule } from './retro-bonus-rule.entity';
import { RetroBonusRuleService } from './retro-bonus-rule.service';

// Closed 4-value set (search-platform#126) — display-only, never stored (see
// RetroBonusRule.accrualKind's own doc comment).
const ACCRUAL_KIND_LABEL: Record<RetroBonusAccrualKind, string> = {
    ПоЗакупкам: 'By purchases',
    ПоПоступлениюДС: 'By cash receipt',
    ПоПоступлениюДССБК: 'By cash receipt (SBK)',
    ПоПродажам: 'By sales',
};

@Resolver('RetroBonusRule')
export class RetroBonusRuleAccrualKindResolver {
    @ResolveField()
    accrualKindLabel(@Parent() rule: RetroBonusRule): string {
        return ACCRUAL_KIND_LABEL[rule.accrualKind] ?? rule.accrualKind;
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

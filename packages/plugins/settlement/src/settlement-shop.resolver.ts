import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { TradingPointService } from '@mivend/plugin-counterparty';

import { SettlementShopService } from './settlement-shop.service';
import type {
    SettlementBalanceCard,
    SettlementDocumentFilter,
    SettlementDocumentPage,
} from './settlement-shop.types';

const DEFAULT_TAKE = 20;

@Resolver()
export class SettlementShopResolver {
    constructor(
        private readonly shopService: SettlementShopService,
        private readonly tradingPointService: TradingPointService,
    ) {}

    @Query()
    async settlementDocuments(
        @Ctx() ctx: RequestContext,
        @Args() args: { filter?: SettlementDocumentFilter; skip?: number; take?: number },
    ): Promise<SettlementDocumentPage> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return { items: [], totalItems: 0 };
        return this.shopService.documents(
            ctx,
            counterpartyId,
            args.filter ?? {},
            args.skip ?? 0,
            args.take ?? DEFAULT_TAKE,
        );
    }

    @Query()
    async settlementBalances(
        @Ctx() ctx: RequestContext,
        @Args() args: { contractId?: string; organizationId?: string },
    ): Promise<SettlementBalanceCard[]> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return [];
        return this.shopService.balanceCards(ctx, counterpartyId, args);
    }
}

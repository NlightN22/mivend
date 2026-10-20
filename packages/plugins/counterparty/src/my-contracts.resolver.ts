import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { ContractService } from './contract.service';
import { toShopContract, type ShopContract } from './my-contracts';
import { TradingPointService } from './trading-point.service';

@Resolver()
export class MyContractsResolver {
    constructor(
        private readonly tradingPointService: TradingPointService,
        private readonly contractService: ContractService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async myContracts(@Ctx() ctx: RequestContext): Promise<ShopContract[]> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return [];
        const contracts = await this.contractService.findActiveCustomerContracts(
            ctx,
            counterpartyId,
        );
        return contracts.map(toShopContract);
    }
}

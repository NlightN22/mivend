import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { CounterpartyBatchLoaders } from './counterparty-batch-loaders.service';
import { Counterparty } from './entities/counterparty.entity';

// No extra permission: whoever sees a counterparty sees the date of its last order.
@Resolver('Counterparty')
export class CounterpartyLastOrderResolver {
    constructor(private loaders: CounterpartyBatchLoaders) {}

    @ResolveField()
    lastOrderAt(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<Date | null> {
        return this.loaders.lastOrderAt(ctx, counterparty.id);
    }
}

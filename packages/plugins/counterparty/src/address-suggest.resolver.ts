import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { AddressSuggestService } from './address-suggest.service';

@Resolver()
export class AddressSuggestResolver {
    constructor(private suggestions: AddressSuggestService) {}

    @Query()
    async suggestAddress(
        @Ctx() ctx: RequestContext,
        @Args() args: { query: string },
    ): Promise<string[]> {
        if (!ctx.activeUserId) return [];
        return this.suggestions.suggest(args.query);
    }
}

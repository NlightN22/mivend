import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    ListQueryOptions,
    PaginatedList,
    Permission,
    RequestContext,
    Transaction,
} from '@vendure/core';

import { LegalNameAbbreviation } from './entities/legal-name-abbreviation.entity';
import { LegalNameAbbreviationService } from './legal-name-abbreviation.service';
import type { LegalNameAbbreviationInput } from './qr-payment/legal-name-abbreviation-input';

// Global settings with no row scope: native settings permissions, no custom permission needed.
@Resolver()
export class LegalNameAbbreviationAdminResolver {
    constructor(private service: LegalNameAbbreviationService) {}

    @Query()
    @Allow(Permission.ReadSettings)
    legalNameAbbreviations(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<LegalNameAbbreviation> },
    ): Promise<PaginatedList<LegalNameAbbreviation>> {
        return this.service.findAll(ctx, args.options);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateSettings)
    createLegalNameAbbreviation(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: LegalNameAbbreviationInput },
    ): Promise<LegalNameAbbreviation> {
        return this.service.create(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateSettings)
    updateLegalNameAbbreviation(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; input: LegalNameAbbreviationInput },
    ): Promise<LegalNameAbbreviation> {
        return this.service.update(ctx, args.id, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateSettings)
    async deleteLegalNameAbbreviation(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<boolean> {
        await this.service.delete(ctx, args.id);
        return true;
    }
}

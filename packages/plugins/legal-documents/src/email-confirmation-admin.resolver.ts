import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Customer, Permission, RequestContext, UserInputError } from '@vendure/core';

import { EmailConfirmationService } from './email-confirmation.service';
import { StaffEmailChangeService } from './staff-email-change.service';

// Reads hang off the already scoped Customer parent; the resend is as scoped as core updateCustomer.
@Resolver('Customer')
export class EmailConfirmationAdminResolver {
    constructor(
        private confirmations: EmailConfirmationService,
        private changes: StaffEmailChangeService,
    ) {}

    @ResolveField()
    @Allow(Permission.ReadCustomer)
    async emailConfirmationPending(
        @Ctx() ctx: RequestContext,
        @Parent() customer: Customer,
    ): Promise<string | null> {
        return (
            (await this.confirmations.getPending(ctx, Number(customer.id)))?.pendingEmail ?? null
        );
    }

    @ResolveField()
    @Allow(Permission.ReadCustomer)
    async emailConfirmationSentAt(
        @Ctx() ctx: RequestContext,
        @Parent() customer: Customer,
    ): Promise<Date | null> {
        return (await this.confirmations.getPending(ctx, Number(customer.id)))?.linkSentAt ?? null;
    }

    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async resendEmailConfirmation(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerId: string },
    ): Promise<boolean> {
        const result = await this.changes.resend(ctx, Number(args.customerId));
        if (result.status === 'none') {
            throw new UserInputError(
                'This customer has no e-mail address waiting for confirmation',
            );
        }
        if (result.status === 'too-soon') {
            throw new UserInputError('A confirmation link was sent less than 5 minutes ago');
        }
        return true;
    }
}

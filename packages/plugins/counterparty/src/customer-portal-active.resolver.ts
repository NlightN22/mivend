import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

@Resolver('Customer')
export class CustomerPortalActiveResolver {
    @ResolveField()
    active(@Parent() customer: { deletedAt?: Date | null }): boolean {
        return customer.deletedAt == null;
    }
}

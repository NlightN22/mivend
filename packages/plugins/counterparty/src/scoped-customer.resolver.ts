import { Args, Query, Resolver } from '@nestjs/graphql';
import type { CustomerListOptions } from '@vendure/common/lib/generated-types';
import { Permission } from '@vendure/common/lib/generated-types';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    Customer,
    CustomerService,
    ListQueryBuilder,
    PaginatedList,
    Relations,
    RelationPaths,
    RequestContext,
} from '@vendure/core';
import { IsNull } from 'typeorm';
import { AccessScopeService } from '@mivend/plugin-access-control';

import { CounterpartyService } from './counterparty.service';
import { applyCustomerScope } from './customer-scope';

// Overrides core's Admin `customers`/`customer`: a portal customer inherits its counterparty's visibility (#263).
@Resolver()
export class ScopedCustomerResolver {
    constructor(
        private customerService: CustomerService,
        private listQueryBuilder: ListQueryBuilder,
        private counterpartyService: CounterpartyService,
        private accessScopeService: AccessScopeService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    async customers(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: CustomerListOptions },
        @Relations(Customer) relations: RelationPaths<Customer>,
    ): Promise<PaginatedList<Customer>> {
        if (await this.seesAll(ctx))
            return this.customerService.findAll(ctx, args.options, relations);
        // Same build as core CustomerService.findAll; the filter stays in its own brackets, the scope is ANDed.
        const customPropertyMap: Record<string, string> = {};
        if (this.listQueryBuilder.filterObjectHasProperty(args.options?.filter, 'postalCode')) {
            relations.push('addresses');
            customPropertyMap.postalCode = 'addresses.postalCode';
        }
        const qb = this.listQueryBuilder.build(Customer, args.options, {
            relations,
            channelId: ctx.channelId,
            where: { deletedAt: IsNull() },
            ctx,
            customPropertyMap,
        });
        const visible = await this.counterpartyService.visibleFilteredQb(ctx, {});
        const [items, totalItems] = await applyCustomerScope(qb, visible).getManyAndCount();
        return { items, totalItems };
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    async customer(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
        @Relations(Customer) relations: RelationPaths<Customer>,
    ): Promise<Customer | undefined> {
        if (await this.seesAll(ctx)) return this.customerService.findOne(ctx, args.id, relations);
        const bare = await this.customerService.findOne(ctx, args.id);
        const counterpartyId = (
            bare?.customFields as { counterpartyId?: string | null } | undefined
        )?.counterpartyId;
        if (!counterpartyId) return undefined;
        if (!(await this.counterpartyService.findOneVisible(ctx, counterpartyId))) return undefined;
        return relations.length ? this.customerService.findOne(ctx, args.id, relations) : bare;
    }

    private async seesAll(ctx: RequestContext): Promise<boolean> {
        return (await this.accessScopeService.resolveCounterpartyScope(ctx)).kind === 'all';
    }
}

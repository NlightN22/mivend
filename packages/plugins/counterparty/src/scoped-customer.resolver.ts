import { Args, Query, Resolver } from '@nestjs/graphql';
import type {
    CustomerFilterParameter,
    CustomerListOptions,
} from '@vendure/common/lib/generated-types';
import { Permission } from '@vendure/common/lib/generated-types';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    Customer,
    CustomerService,
    PaginatedList,
    Relations,
    RelationPaths,
    RequestContext,
} from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';

import { CounterpartyService } from './counterparty.service';

type Filter = CustomerFilterParameter & { counterpartyId?: { in?: string[] } };

// The caller's filter AND the visible counterparties; an OR filter is nested so it cannot widen the scope.
export function scopedCustomerOptions(
    options: CustomerListOptions | undefined,
    visibleIds: string[],
): CustomerListOptions {
    const own = options?.filter;
    const caller =
        own && options?.filterOperator === 'OR'
            ? { _or: Object.entries(own).map(([key, value]) => ({ [key]: value })) }
            : own;
    const scope: Filter = { counterpartyId: { in: visibleIds } };
    return {
        ...options,
        filterOperator: undefined,
        filter: (caller ? { _and: [caller, scope] } : scope) as CustomerFilterParameter,
    };
}

// Overrides core's Admin `customers`/`customer`: a portal customer inherits its counterparty's visibility (#263).
@Resolver()
export class ScopedCustomerResolver {
    constructor(
        private customerService: CustomerService,
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
        const visible = (await this.counterpartyService.findVisible(ctx)).map(c => String(c.id));
        if (visible.length === 0) return { items: [], totalItems: 0 };
        return this.customerService.findAll(
            ctx,
            scopedCustomerOptions(args.options, visible),
            relations,
        );
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    async customer(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
        @Relations(Customer) relations: RelationPaths<Customer>,
    ): Promise<Customer | undefined> {
        const customer = await this.customerService.findOne(ctx, args.id, relations);
        if (!customer || (await this.seesAll(ctx))) return customer;
        const counterpartyId = (customer.customFields as { counterpartyId?: string | null })
            .counterpartyId;
        if (!counterpartyId) return undefined;
        const visible = await this.counterpartyService.findOneVisible(ctx, counterpartyId);
        return visible ? customer : undefined;
    }

    private async seesAll(ctx: RequestContext): Promise<boolean> {
        return (await this.accessScopeService.resolveCounterpartyScope(ctx)).kind === 'all';
    }
}

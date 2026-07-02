import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { CUSTOMER_PRICING_PLUGIN_OPTIONS } from './constants';
import { CustomerPriceType } from './entities/customer-price-type.entity';
import { PriceType } from './entities/price-type.entity';
import { CustomerPricingResolver, PriceTypeResolver } from './customer-pricing.resolver';
import { CustomerPricingService } from './customer-pricing.service';
import { CustomerPricingPluginOptions } from './types';

const schemaExtension = gql`
    type PriceType {
        id: ID!
        code: String!
        name: String!
        isActive: Boolean!
    }

    extend type Customer {
        priceType: PriceType
    }

    extend type Query {
        priceTypes: [PriceType!]!
    }

    extend type Mutation {
        upsertPriceType(code: String!, name: String!): PriceType!
        setCustomerPriceType(customerId: ID!, priceTypeId: ID!): Customer!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [PriceType, CustomerPriceType],
    adminApiExtensions: {
        schema: schemaExtension,
        resolvers: [CustomerPricingResolver, PriceTypeResolver],
    },
    providers: [
        CustomerPricingService,
        {
            provide: CUSTOMER_PRICING_PLUGIN_OPTIONS,
            useFactory: (): CustomerPricingPluginOptions => CustomerPricingPlugin.options,
        },
    ],
    exports: [CustomerPricingService],
    compatibility: '>0.0.0',
})
export class CustomerPricingPlugin {
    static options: CustomerPricingPluginOptions;

    static init(options: CustomerPricingPluginOptions): Type<CustomerPricingPlugin> {
        this.options = options;
        return CustomerPricingPlugin;
    }
}

import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { CUSTOMER_PRICING_PLUGIN_OPTIONS } from './constants';
import { CustomerPriceType } from './entities/customer-price-type.entity';
import { PriceType } from './entities/price-type.entity';
import { CustomerPricingService } from './customer-pricing.service';
import { CustomerPricingPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [PriceType, CustomerPriceType],
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

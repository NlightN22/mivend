import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig } from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { freightEligibilityChecker } from './freight-eligibility-checker';
import { freightOrderGuard } from './freight-order-guard';
import { FreightShippingBootstrapService } from './freight-shipping-bootstrap.service';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin],
    providers: [FreightShippingBootstrapService],
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        config.shippingOptions.shippingEligibilityCheckers = [
            ...(config.shippingOptions.shippingEligibilityCheckers ?? []),
            freightEligibilityChecker,
        ];
        config.orderOptions.process = [...(config.orderOptions.process ?? []), freightOrderGuard];
        return config;
    },
    compatibility: '>0.0.0',
})
export class FreightShippingPlugin {}

import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig } from '@vendure/core';
import { ChecksPlugin } from '@mivend/plugin-checks';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { freightEligibilityChecker } from './freight-eligibility-checker';
import { FreightShippingBootstrapService } from './freight-shipping-bootstrap.service';
import { FreightTradingPointRegistrar } from './freight-trading-point.registrar';

@VendurePlugin({
    imports: [PluginCommonModule, ChecksPlugin, CounterpartyPlugin],
    providers: [FreightShippingBootstrapService, FreightTradingPointRegistrar],
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        config.shippingOptions.shippingEligibilityCheckers = [
            ...(config.shippingOptions.shippingEligibilityCheckers ?? []),
            freightEligibilityChecker,
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class FreightShippingPlugin {}

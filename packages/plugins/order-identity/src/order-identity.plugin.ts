import { PluginCommonModule, RuntimeVendureConfig, VendurePlugin } from '@vendure/core';

import { OrderLineIdentity } from './entities/order-line-identity.entity';
import { OrderLineIdentityService } from './order-line-identity.service';
import { OrderLineIdentitySubscriber } from './order-line-identity.subscriber';
import { serializeActiveOrderStrategies } from './serialized-active-order.strategy';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [OrderLineIdentity],
    providers: [OrderLineIdentityService],
    exports: [OrderLineIdentityService],
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        const existing = config.dbConnectionOptions.subscribers;
        config.dbConnectionOptions = {
            ...config.dbConnectionOptions,
            subscribers: [
                ...(Array.isArray(existing) ? existing : []),
                OrderLineIdentitySubscriber,
            ],
        };
        config.orderOptions.activeOrderStrategy = serializeActiveOrderStrategies(
            config.orderOptions.activeOrderStrategy,
        );
        return config;
    },
    compatibility: '>0.0.0',
})
export class OrderIdentityPlugin {}

import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { PickupShippingBootstrapService } from './pickup-shipping-bootstrap.service';

// Intentionally declares no customFields, entities, or resolvers;
// all setup runs idempotently in PickupShippingBootstrapService.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [PickupShippingBootstrapService],
    compatibility: '>0.0.0',
})
export class PickupShippingPlugin {}

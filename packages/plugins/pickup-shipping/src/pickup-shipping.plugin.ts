import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { PickupShippingBootstrapService } from './pickup-shipping-bootstrap.service';

// No customFields, no entities, no resolvers — this plugin's only job is the idempotent
// ShippingMethod bootstrap in PickupShippingBootstrapService, replacing the manual
// createShippingMethod call that used to live in infrastructure/scripts/seed-erp.mjs.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [PickupShippingBootstrapService],
    compatibility: '>0.0.0',
})
export class PickupShippingPlugin {}

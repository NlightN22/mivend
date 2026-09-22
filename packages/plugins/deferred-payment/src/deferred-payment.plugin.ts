import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { DeferredPaymentBootstrapService } from './deferred-payment-bootstrap.service';

// No customFields, no entities, no resolvers — this plugin's only job is the idempotent
// PaymentMethod bootstrap in DeferredPaymentBootstrapService. The PaymentMethodHandler itself
// is a plain exported object (deferred-payment-handler.ts), registered centrally in
// apps/server/src/vendure-config.ts's paymentOptions.paymentMethodHandlers, per Vendure's
// requirement that handlers be registered there rather than purely via @VendurePlugin.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [DeferredPaymentBootstrapService],
    compatibility: '>0.0.0',
})
export class DeferredPaymentPlugin {}

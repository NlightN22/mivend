import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { OpenDeferredExposureService } from './open-deferred-exposure.service';
import { DeferredPaymentBootstrapService } from './deferred-payment-bootstrap.service';

// Handler and eligibility checker are plain objects registered in vendure-config's paymentOptions.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [DeferredPaymentBootstrapService, OpenDeferredExposureService],
    compatibility: '>0.0.0',
})
export class DeferredPaymentPlugin {}

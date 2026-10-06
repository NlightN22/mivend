import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { OnlineStubBootstrapService } from './online-stub-bootstrap.service';

// The online-stub PaymentMethod is enabled only when ONLINE_PAYMENT_STUB_ENABLED=true.
// The handler resolves acquiring services via the root injector, not a module import.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [OnlineStubBootstrapService],
    compatibility: '>0.0.0',
})
export class OnlinePaymentPlugin {}

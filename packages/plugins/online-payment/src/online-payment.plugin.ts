import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { OnlineStubBootstrapService } from './online-stub-bootstrap.service';

// Currently only provides the demo online-stub handler/bootstrap — the natural place a future
// real payment-acquiring integration would replace or extend it.
//
// onlineStubPaymentHandler's init() resolves InvoiceService/PaymentAttemptService from
// @mivend/plugin-acquiring via the root Vendure injector at runtime, same as before this plugin
// existed — not declared as a NestJS `imports` dependency here, since AcquiringPlugin is
// currently central-only (see vendure-config.ts's instancePlugins) while this plugin is not;
// declaring it would pull acquiring's entities/schema into branch too.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [OnlineStubBootstrapService],
    compatibility: '>0.0.0',
})
export class OnlinePaymentPlugin {}

import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { Dispute } from './entities/dispute.entity';
import { FiscalReceipt } from './entities/fiscal-receipt.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { IncomingPaymentEvent } from './entities/incoming-payment-event.entity';
import { Invoice } from './entities/invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentReconciliationIssue } from './entities/payment-reconciliation-issue.entity';
import { PaymentRefund } from './entities/payment-refund.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';
import { DisputeService } from './dispute.service';
import { IdempotencyService } from './idempotency.service';
import { InboxService } from './inbox.service';
import { InvoiceService } from './invoice.service';
import { PaymentAttemptService } from './payment-attempt.service';
import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { PaymentInboxWorker } from './payment-inbox.worker';
import { PaymentEventListener } from './payment-event.listener';
import { PaymentRefundService } from './payment-refund.service';
import { SettlementEntryService } from './settlement-entry.service';
import {
    InvoiceAdminResolver,
    InvoiceShopResolver,
    InvoiceFieldResolver,
} from './invoice.resolver';
import { PaymentAdminResolver } from './payment-admin.resolver';
import { PaymentFieldResolver, PaymentShopResolver } from './payment.resolver';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';
import { ACQUIRING_PLUGIN_OPTIONS } from './types';
import type { AcquiringPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin],
    entities: [
        Invoice,
        PaymentAttempt,
        FiscalReceipt,
        PaymentRefund,
        Dispute,
        SettlementEntry,
        PaymentReconciliationIssue,
        IdempotencyKey,
        IncomingPaymentEvent,
    ],
    providers: [
        IdempotencyService,
        InboxService,
        InvoiceService,
        PaymentAttemptService,
        SettlementEntryService,
        PaymentInboxProcessorService,
        PaymentInboxWorker,
        PaymentEventListener,
        PaymentRefundService,
        DisputeService,
        {
            provide: ACQUIRING_PLUGIN_OPTIONS,
            useFactory: (): AcquiringPluginOptions => AcquiringPlugin.options,
        },
    ],
    exports: [
        IdempotencyService,
        InboxService,
        InvoiceService,
        PaymentAttemptService,
        SettlementEntryService,
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [InvoiceAdminResolver, PaymentAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [
            InvoiceShopResolver,
            InvoiceFieldResolver,
            PaymentShopResolver,
            PaymentFieldResolver,
        ],
    },
    compatibility: '>0.0.0',
})
export class AcquiringPlugin {
    static options: AcquiringPluginOptions;

    static init(options: AcquiringPluginOptions): Type<AcquiringPlugin> {
        this.options = options;
        return AcquiringPlugin;
    }
}

import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { Dispute } from './entities/dispute.entity';
import { FiscalReceipt } from './entities/fiscal-receipt.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { Invoice } from './entities/invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentReconciliationIssue } from './entities/payment-reconciliation-issue.entity';
import { ProcessedProviderEvent } from './entities/processed-provider-event.entity';
import { PaymentRefund } from './entities/payment-refund.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';
import { IdempotencyService } from './idempotency.service';
import { InboxService } from './inbox.service';
import { InvoiceService } from './invoice.service';
import { InvoiceAdminResolver, InvoiceShopResolver } from './invoice.resolver';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';

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
        ProcessedProviderEvent,
    ],
    providers: [IdempotencyService, InboxService, InvoiceService],
    exports: [IdempotencyService, InboxService, InvoiceService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [InvoiceAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [InvoiceShopResolver],
    },
    compatibility: '>0.0.0',
})
export class AcquiringPlugin {}

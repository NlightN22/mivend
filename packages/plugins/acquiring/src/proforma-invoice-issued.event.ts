import { RequestContext, VendureEvent } from '@vendure/core';

import { ProformaInvoice } from './entities/proforma-invoice.entity';

// Published for a snapshot created after placement (on-demand request); the checkout path is covered by the
// order-placed hook in the documents plugin.
export class ProformaInvoiceIssuedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public proformaInvoice: ProformaInvoice,
    ) {
        super();
    }
}

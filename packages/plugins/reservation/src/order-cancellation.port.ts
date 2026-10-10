import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

import type { CancelSubmission } from './order-cancellation.decision';

export interface CancelRequestSubject {
    orderId: string;
    orderUuid: string;
    orderCode: string;
}

// What plugin-reservation needs from the ERP integration without importing it (erp-integration
// depends on this plugin): the outbound state of the order's confirmed event and the cancel request.
export interface OrderCancellationPort {
    // 'sent' once the confirmed event reached the broker, 'pending' while it still waits in the outbox.
    submissionState(ctx: RequestContext, orderId: string): Promise<CancelSubmission>;
    // Conditional on the row still waiting: false means the publisher got there first.
    skipPendingSubmission(ctx: RequestContext, orderId: string, reason: string): Promise<boolean>;
    // At most one external effect per orderUuid; a repeat is a no-op.
    requestCancel(ctx: RequestContext, subject: CancelRequestSubject): Promise<void>;
}

@Injectable()
export class OrderCancellationPortRegistry {
    private port: OrderCancellationPort | undefined;

    register(port: OrderCancellationPort): void {
        this.port = port;
    }

    get(): OrderCancellationPort {
        if (!this.port) {
            throw new Error('No order cancellation port registered (erp-integration not loaded)');
        }
        return this.port;
    }
}

import { Logger } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { IntegrationInboxService } from './integration-inbox.service';
import type { ClassifiedKafkaMessage } from './kafka-inbound-message';
import { loggerCtx } from './types';
import type { InboundStream } from './types';

export async function storeClassified(
    inbox: IntegrationInboxService,
    ctx: RequestContext,
    classified: ClassifiedKafkaMessage,
    stream: InboundStream,
    offset: string,
): Promise<void> {
    if (classified.kind === 'rejected') {
        Logger.error(
            `Rejected ${stream} message (offset=${offset}): ${classified.rejected.reason}`,
            loggerCtx,
        );
        await inbox.enqueueRejected(ctx, classified.rejected);
        return;
    }
    await inbox.enqueue(ctx, classified.input);
}

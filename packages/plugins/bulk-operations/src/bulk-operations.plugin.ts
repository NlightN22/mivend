import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { BulkBatch } from './entities/bulk-batch.entity';
import { BulkBatchItem } from './entities/bulk-batch-item.entity';
import { BulkBatchQueryService } from './bulk-batch-query.service';
import { BulkBatchRunner } from './bulk-batch-runner';
import { BulkBatchService } from './bulk-batch.service';
import { BulkExecutorRegistry } from './bulk-executor-registry';
import { BulkOperationsResolver } from './bulk-operations.resolver';
import { adminApiSchema } from './bulk-operations.schema';
import { BulkRunQueue } from './bulk-run-queue';

// Tables are created by a migration (batch, item, number sequence); operations register
// an executor on BulkExecutorRegistry from the plugin that owns the data.
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [BulkBatch, BulkBatchItem],
    providers: [
        BulkExecutorRegistry,
        BulkBatchService,
        BulkBatchRunner,
        BulkBatchQueryService,
        BulkRunQueue,
    ],
    exports: [BulkExecutorRegistry],
    adminApiExtensions: { schema: adminApiSchema, resolvers: [BulkOperationsResolver] },
    compatibility: '>0.0.0',
})
export class BulkOperationsPlugin {}

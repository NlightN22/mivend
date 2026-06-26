export { SyncPlugin } from './src/sync.plugin';
export { SyncService } from './src/sync.service';
export { SyncLogger } from './src/sync-logger';
export { SyncOutboxEntry } from './src/entities/sync-outbox.entity';
export { SyncProcessedEvent } from './src/entities/sync-processed-event.entity';
export { StubErpAdapter } from './src/erp-adapter.stub';
export type { SyncPluginOptions, RabbitMQConfig, RedisConfig } from './src/types';
export type {
    ErpAdapter,
    ErpChangeSet,
    ErpOrderRef,
    Order,
    InventoryDelta,
} from './src/erp-adapter.interface';

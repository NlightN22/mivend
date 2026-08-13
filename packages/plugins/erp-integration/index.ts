export { ErpIntegrationPlugin } from './src/erp-integration.plugin';
export { IntegrationOutboxService } from './src/integration-outbox.service';
export { IntegrationOutboxProcessorService } from './src/integration-outbox-processor.service';
export { KafkaProducerService } from './src/kafka-producer.service';
export { SchemaRegistryClient } from './src/schema-registry.client';
export { IntegrationOutboxEntry } from './src/entities/integration-outbox-entry.entity';
export { encodeConfluentMessage, decodeConfluentMessage } from './src/wire-format';
export type { DecodedConfluentMessage } from './src/wire-format';
export type {
    ErpIntegrationPluginOptions,
    KafkaConfig,
    SchemaRegistryConfig,
    RedisConfig,
} from './src/types';
export type { OrderSubmittedPayload } from './src/schemas/order-submitted.schema';

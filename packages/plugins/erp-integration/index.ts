export { ErpIntegrationPlugin } from './src/erp-integration.plugin';
export { IntegrationOutboxService } from './src/integration-outbox.service';
export { IntegrationOutboxProcessorService } from './src/integration-outbox-processor.service';
export { IntegrationInboxService } from './src/integration-inbox.service';
export { IntegrationInboxProcessorService } from './src/integration-inbox-processor.service';
export { KafkaProducerService } from './src/kafka-producer.service';
export { KafkaConsumerService } from './src/kafka-consumer.service';
export { SchemaRegistryClient } from './src/schema-registry.client';
export { IntegrationOutboxEntry } from './src/entities/integration-outbox-entry.entity';
export { IntegrationInboxEvent } from './src/entities/integration-inbox-event.entity';
export type { IntegrationInboxEventStatus } from './src/entities/integration-inbox-event.entity';
export { encodeConfluentMessage } from './src/wire-format';
export type {
    ErpIntegrationPluginOptions,
    KafkaConfig,
    KafkaConsumerConfig,
    SchemaRegistryConfig,
    RedisConfig,
    InboundStream,
} from './src/types';
export type { OrderSubmittedPayload } from './src/schemas/order-submitted.schema';

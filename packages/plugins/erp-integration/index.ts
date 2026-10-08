export { ErpIntegrationPlugin } from './src/erp-integration.plugin';
export { IntegrationOutboxProcessorService } from './src/integration-outbox-processor.service';
export { IntegrationInboxService } from './src/integration-inbox.service';
export { IntegrationInboxProcessorService } from './src/integration-inbox-processor.service';
export { KafkaConsumerService } from './src/kafka-consumer.service';
export { SchemaRegistryClient } from './src/schema-registry.client';
export { IntegrationInboxEvent } from './src/entities/integration-inbox-event.entity';
export { Manufacturer } from './src/entities/manufacturer.entity';
export type { IntegrationInboxEventStatus } from './src/entities/integration-inbox-event.entity';
export { encodeConfluentMessage } from './src/wire-format';
export { BranchStockLocationStrategy } from './src/branch-stock-location.strategy';
export type {
    ErpIntegrationPluginOptions,
    KafkaConfig,
    KafkaConsumerConfig,
    SchemaRegistryConfig,
    InboundStream,
} from './src/types';
export type { OrderSubmittedPayload } from './src/schemas/order-submitted.schema';

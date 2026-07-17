import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig } from '@vendure/core';
import gql from 'graphql-tag';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { ReplicaOrderInterceptor, ReplicaOrderProcess } from './replica-order.guard';

import { ProductConsumer } from './consumers/product.consumer';
import { CentralConsumer } from './consumers/central.consumer';
import { OrderConsumer } from './consumers/order.consumer';
import { ReservationConsumer } from './consumers/reservation.consumer';
import { AdministratorSyncProducer } from './consumers/administrator-sync.producer';
import { AdministratorSyncService } from './administrator-sync.service';
import { OrderSyncService } from './order-sync.service';
import { PaymentSyncResolver } from './payment-sync.resolver';
import { ErpCallbackController } from './erp-callback.controller';
import { ErpOrderStatusController } from './erp-order-status.controller';
import { SyncOutboxEntry } from './entities/sync-outbox.entity';
import { SyncProcessedEvent } from './entities/sync-processed-event.entity';
import { OutboxWorker } from './outbox.worker';
import { RabbitMQService } from './rabbitmq.service';
import { SyncLogger } from './sync-logger';
import { SyncService } from './sync.service';
import { SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';

const adminApiSchema = gql`
    extend type Mutation {
        # Placeholder entry point for a branch till/kassa integration (no real hardware yet) —
        # see payment-sync.resolver.ts / docs/architecture.md's "Order as a read-model" section.
        recordWitnessedPayment(
            orderId: ID!
            method: String!
            amount: Int!
            invoiceId: Int
            organizationId: Int
            outcome: String
            rrn: String
        ): Boolean!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, ErpOrderPlugin, ReservationPlugin],
    entities: [SyncOutboxEntry, SyncProcessedEvent],
    providers: [
        SyncLogger,
        RabbitMQService,
        SyncService,
        OutboxWorker,
        ProductConsumer,
        CentralConsumer,
        OrderConsumer,
        ReservationConsumer,
        AdministratorSyncProducer,
        AdministratorSyncService,
        OrderSyncService,
        PaymentSyncResolver,
        {
            provide: SYNC_PLUGIN_OPTIONS,
            useFactory: (): SyncPluginOptions => SyncPlugin.options,
        },
    ],
    controllers: [ErpCallbackController, ErpOrderStatusController],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [PaymentSyncResolver],
    },
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        // Order conflict rule — see replica-order.guard.ts's doc comment for the full reasoning
        // ("origin instance always wins", not last-write-wins).
        config.orderOptions.orderInterceptors = [
            ...(config.orderOptions.orderInterceptors ?? []),
            new ReplicaOrderInterceptor(),
        ];
        config.orderOptions.process = [
            ...(config.orderOptions.process ?? []),
            new ReplicaOrderProcess(),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class SyncPlugin {
    static options: SyncPluginOptions;

    static init(options: SyncPluginOptions): Type<SyncPlugin> {
        this.options = options;
        return SyncPlugin;
    }
}

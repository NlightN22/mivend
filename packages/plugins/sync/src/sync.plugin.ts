import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { ProductConsumer } from './consumers/product.consumer';
import { OrderConsumer } from './consumers/order.consumer';
import { ReservationConsumer } from './consumers/reservation.consumer';
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

@VendurePlugin({
    imports: [PluginCommonModule, ErpOrderPlugin, ReservationPlugin],
    entities: [SyncOutboxEntry, SyncProcessedEvent],
    providers: [
        SyncLogger,
        RabbitMQService,
        SyncService,
        OutboxWorker,
        ProductConsumer,
        OrderConsumer,
        ReservationConsumer,
        {
            provide: SYNC_PLUGIN_OPTIONS,
            useFactory: (): SyncPluginOptions => SyncPlugin.options,
        },
    ],
    controllers: [ErpCallbackController, ErpOrderStatusController],
    compatibility: '>0.0.0',
})
export class SyncPlugin {
    static options: SyncPluginOptions;

    static init(options: SyncPluginOptions): Type<SyncPlugin> {
        this.options = options;
        return SyncPlugin;
    }
}

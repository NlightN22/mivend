import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';

@Injectable()
export class OrderConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(OrderConsumer.name);

    constructor(private readonly eventBus: EventBus) {}

    onApplicationBootstrap(): void {
        this.eventBus.ofType(OrderReadyForErpEvent).subscribe(event => {
            // TODO Phase 2: write to outbox and publish via RabbitMQ
            this.logger.log(`Order ${event.orderCode} ready for ERP (stub)`);
        });
    }
}

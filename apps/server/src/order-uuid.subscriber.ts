import { randomUUID } from 'node:crypto';
import { Order, OrderLine } from '@vendure/core';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';

// customFields columns are nullable at the schema level (Vendure constraint), but
// docs/identifiers.md requires uuid to be present on every Order/OrderLine right after creation —
// this subscriber is the synchronous, same-transaction assignment point (unlike an EventBus
// listener, which only runs after commit).
@EventSubscriber()
export class OrderUuidSubscriber implements EntitySubscriberInterface<Order> {
    listenTo(): typeof Order {
        return Order;
    }

    beforeInsert(event: InsertEvent<Order>): void {
        const entity = event.entity;
        if (!entity) {
            return;
        }
        entity.customFields = entity.customFields ?? {};
        if (!entity.customFields.uuid) {
            entity.customFields.uuid = randomUUID();
        }
    }
}

@EventSubscriber()
export class OrderLineUuidSubscriber implements EntitySubscriberInterface<OrderLine> {
    listenTo(): typeof OrderLine {
        return OrderLine;
    }

    beforeInsert(event: InsertEvent<OrderLine>): void {
        const entity = event.entity;
        if (!entity) {
            return;
        }
        entity.customFields = entity.customFields ?? {};
        if (!entity.customFields.uuid) {
            entity.customFields.uuid = randomUUID();
        }
    }
}

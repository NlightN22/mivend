import { randomUUID } from 'node:crypto';
import { Order } from '@vendure/core';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';

// Same-transaction assignment (an EventBus listener runs after commit); line uuids live in
// plugin-order-identity, see docs/identifiers.md.
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

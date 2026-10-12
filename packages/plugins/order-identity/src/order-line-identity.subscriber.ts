import { randomUUID } from 'node:crypto';
import { OrderLine } from '@vendure/core';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';

import { OrderLineIdentity } from './entities/order-line-identity.entity';

// Same transaction as the line insert (event.manager), so a committed line always has its uuid.
@EventSubscriber()
export class OrderLineIdentitySubscriber implements EntitySubscriberInterface<OrderLine> {
    listenTo(): typeof OrderLine {
        return OrderLine;
    }

    async afterInsert(event: InsertEvent<OrderLine>): Promise<void> {
        await event.manager.insert(OrderLineIdentity, {
            orderLineId: Number(event.entity.id),
            uuid: randomUUID(),
        });
    }
}

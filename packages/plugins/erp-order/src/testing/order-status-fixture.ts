import { MIVEND_ORDER_STATUSES } from '../mivend-order-statuses';
import { provisionMivendOrderStatuses, type SqlQuery } from '../order-status-provisioning.service';
import { OrderStatusDictionary, type OrderStatusEntry } from '../order-status-dictionary';

const BASE = {
    terminal: false,
    customerVisible: true,
    warehouseStarted: false,
    shipped: false,
    delivered: false,
    cancelled: false,
    initial: false,
    submitted: false,
    rejected: false,
    reservationConfirmed: false,
    externalDefault: false,
    description: '',
    source: 'erp' as const,
};

const erp = (
    code: string,
    rank: number,
    customerGroup: string,
    flags: Partial<OrderStatusEntry> = {},
): OrderStatusEntry => ({ ...BASE, code, name: code, rank, customerGroup, ...flags });

// Synthetic ERP rows for tests; the mivend rows are the real provisioned ones.
export const ERP_ORDER_STATUS_FIXTURE: readonly OrderStatusEntry[] = [
    erp('UNDER_APPROVAL', 3, 'pending'),
    erp('APPROVED', 4, 'confirmed'),
    erp('PICKING', 5, 'confirmed', { warehouseStarted: true }),
    erp('SHIPPING', 6, 'in_transit', { warehouseStarted: true, shipped: true }),
    erp('DELIVERING', 7, 'in_transit', { warehouseStarted: true, shipped: true }),
    erp('DELIVERED', 8, 'delivered', {
        warehouseStarted: true,
        shipped: true,
        delivered: true,
        terminal: true,
    }),
    erp('CANCELLED', 0, 'cancelled', { cancelled: true, terminal: true }),
];

export function testOrderStatusDictionary(): OrderStatusDictionary {
    return new OrderStatusDictionary([...MIVEND_ORDER_STATUSES, ...ERP_ORDER_STATUS_FIXTURE]);
}

// Fills `order_status_reference` of an integration-test schema: the real provisioned mivend rows plus
// the synthetic ERP fixture.
export async function seedTestOrderStatuses(query: SqlQuery): Promise<void> {
    await provisionMivendOrderStatuses(query);
    for (const e of ERP_ORDER_STATUS_FIXTURE) {
        await query(
            `INSERT INTO "order_status_reference"
                ("code","name","rank","terminal","customerVisible","description","source",
                 "customerGroup","warehouseStarted","shipped","delivered","cancelled","isDeleted","sourceVersion")
             VALUES ($1,$2,$3,$4,$5,$6,'erp',$7,$8,$9,$10,$11,false,'0')
             ON CONFLICT ("code") DO NOTHING`,
            [
                e.code,
                e.name,
                e.rank,
                e.terminal,
                e.customerVisible,
                e.description,
                e.customerGroup,
                e.warehouseStarted,
                e.shipped,
                e.delivered,
                e.cancelled,
            ],
        );
    }
}

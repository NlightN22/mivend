import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';

import { MIVEND_ORDER_STATUSES } from './mivend-order-statuses';

export type SqlQuery = (sql: string, params: unknown[]) => Promise<unknown>;

const UPSERT = `INSERT INTO "order_status_reference"
    ("code", "name", "rank", "terminal", "customerVisible", "description", "source",
     "customerGroup", "warehouseStarted", "shipped", "delivered", "cancelled",
     "initial", "submitted", "rejected", "reservationConfirmed", "externalDefault",
     "isDeleted", "sourceVersion")
 VALUES ($1,$2,$3,$4,$5,$6,'mivend',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false,'0')
 ON CONFLICT ("code") DO UPDATE SET
    "name" = EXCLUDED."name", "rank" = EXCLUDED."rank",
    "terminal" = EXCLUDED."terminal", "customerVisible" = EXCLUDED."customerVisible",
    "description" = EXCLUDED."description", "customerGroup" = EXCLUDED."customerGroup",
    "warehouseStarted" = EXCLUDED."warehouseStarted", "shipped" = EXCLUDED."shipped",
    "delivered" = EXCLUDED."delivered", "cancelled" = EXCLUDED."cancelled",
    "initial" = EXCLUDED."initial", "submitted" = EXCLUDED."submitted",
    "rejected" = EXCLUDED."rejected",
    "reservationConfirmed" = EXCLUDED."reservationConfirmed",
    "externalDefault" = EXCLUDED."externalDefault", "isDeleted" = false
 WHERE "order_status_reference"."source" = 'mivend'`;

// An atomic upsert per row, so a server and a worker booting together cannot collide. Also called by
// integration tests with their own DataSource, so they see the real provisioned rows.
export async function provisionMivendOrderStatuses(query: SqlQuery): Promise<void> {
    for (const s of MIVEND_ORDER_STATUSES) {
        await query(UPSERT, [
            s.code,
            s.name,
            s.rank,
            s.terminal,
            s.customerVisible,
            s.description,
            s.customerGroup,
            s.warehouseStarted,
            s.shipped,
            s.delivered,
            s.cancelled,
            s.initial,
            s.submitted,
            s.rejected,
            s.reservationConfirmed,
            s.externalDefault,
        ]);
    }
}

// Self-provisions the mivend-pipeline dictionary rows at boot, like the default roles.
@Injectable()
export class OrderStatusProvisioningService implements OnApplicationBootstrap {
    constructor(private connection: TransactionalConnection) {}

    async onApplicationBootstrap(): Promise<void> {
        await provisionMivendOrderStatuses((sql, params) =>
            this.connection.rawConnection.query(sql, params),
        );
    }
}

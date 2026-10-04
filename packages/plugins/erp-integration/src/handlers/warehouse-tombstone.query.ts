import type { DataSource } from 'typeorm';

import type { IntegrationInboxEvent } from '../entities/integration-inbox-event.entity';

export async function isWarehouseTombstoned(
    dataSource: DataSource,
    warehouseErpId: string,
): Promise<boolean> {
    const latest = await dataSource
        .createQueryBuilder()
        .select(['e.status AS status', 'e.payload->>\'isDeleted\' AS "isDeleted"'])
        .from('integration_inbox_event', 'e')
        .where("e.stream = 'warehouse'")
        .andWhere('e.entity_id = :erpId', { erpId: warehouseErpId })
        .orderBy('e.id', 'DESC')
        .limit(1)
        .getRawOne<{ status: IntegrationInboxEvent['status']; isDeleted: string | null }>();
    return latest?.status === 'processed' && latest.isDeleted === 'true';
}

import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { DepartmentService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDepartmentHandler';

// Applies Integration Service's `department` stream (DepartmentChanged — 1C's "Подразделение",
// company.customers.events.v1.department-changed). entityId is 1C's own GUID
// ("Подразделение_Key") — the same value WarehouseChanged.branchId refers to, though this
// handler only upserts the Department record itself; it deliberately does not drive any
// warehouse→branch linkage (see WarehouseStreamHandler/BranchStockLocationStrategy's own
// comments — mivend's branch assignment is its own, staff-managed concept, independent of
// whatever org unit 1C calls a "division" for its own purposes).
@Injectable()
export class DepartmentStreamHandler implements InboundStreamHandler {
    constructor(private readonly departmentService: DepartmentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = String(payload.name ?? '');
        if (!name) {
            Logger.warn(`department ${entityId}: missing name, skipping`, loggerCtx);
            return;
        }
        const parentErpId = payload.parentId ? String(payload.parentId) : null;

        await this.departmentService.upsert(ctx, { erpId: entityId, name, parentErpId });
        Logger.verbose(`Upserted department erpId=${entityId}`, loggerCtx);
    }
}

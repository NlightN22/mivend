import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { DepartmentService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDepartmentHandler';

// Applies Integration Service's `department` stream (DepartmentChanged — the ERP's "Подразделение",
// company.customers.events.v1.department-changed). entityId is the ERP's own GUID
// ("Подразделение_Key") — the same value WarehouseChanged.branchId refers to, though this
// handler only upserts the Department record itself; it deliberately does not drive any
// warehouse→branch linkage (see WarehouseStreamHandler/BranchStockLocationStrategy's own
// comments — mivend's branch assignment is its own, staff-managed concept, independent of
// whatever org unit ERP calls a "division" for its own purposes).
@Injectable()
export class DepartmentStreamHandler implements InboundStreamHandler {
    constructor(private readonly departmentService: DepartmentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission). isDeleted folds in the same way every sibling handler does
        // (mivend.issue.88 follow-up, 2026-09-15) — this handler previously never read either
        // field at all, despite DepartmentChanged carrying both; a deactivated/deleted ERP
        // department had no way to reflect that locally (Department had no isActive column).
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const name = payload.name ? String(payload.name) : null;
        if (!name) {
            // A deletion tombstone never carries a name (confirmed for organization/warehouse/
            // category — same shape here). Still update isActive on an already-known
            // department; never fabricate a brand-new one with a blank name.
            const updated = await this.departmentService.setActiveStateIfExists(
                ctx,
                entityId,
                isActive,
            );
            if (!updated) {
                Logger.warn(
                    `department ${entityId}: missing name and no existing row, skipping`,
                    loggerCtx,
                );
            }
            return;
        }
        const parentErpId = payload.parentId ? String(payload.parentId) : null;

        await this.departmentService.upsert(ctx, { erpId: entityId, name, parentErpId, isActive });
        Logger.verbose(`Upserted department erpId=${entityId}`, loggerCtx);
    }
}

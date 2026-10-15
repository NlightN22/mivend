import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { DepartmentService } from '@mivend/plugin-access-control';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDepartmentHandler';

// entityId is the ERP GUID shared with WarehouseChanged.branchId; never link warehouses here.
// Branch assignment is staff-managed in mivend, independent of the ERP's department concept.
@Injectable()
export class DepartmentStreamHandler implements InboundStreamHandler {
    constructor(private readonly departmentService: DepartmentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // Absent isActive means false: proto3 omits bool zero values, so do not default it to true.
        // Handle isDeleted the same way as the sibling handlers.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const name = payload.name ? String(payload.name) : null;
        if (!name) {
            // Deletion tombstones carry no name, so only update isActive on an already-known department.
            // Never create a new Department from a tombstone; it would get a blank name.
            const updated = await this.departmentService.setActiveStateIfExists(
                ctx,
                entityId,
                isActive,
            );
            return updated
                ? inboundApplied()
                : inboundNoop(`department ${entityId}: missing name and no existing row, skipping`);
        }
        const parentErpId = payload.parentId ? String(payload.parentId) : null;

        await this.departmentService.upsert(ctx, { erpId: entityId, name, parentErpId, isActive });
        Logger.verbose(`Upserted department erpId=${entityId}`, loggerCtx);
        return inboundApplied();
    }
}

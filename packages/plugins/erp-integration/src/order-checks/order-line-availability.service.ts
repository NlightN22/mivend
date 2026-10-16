import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Order, RequestContext, StockLocation, TransactionalConnection } from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';
import {
    OrderCheckSubjectLoader,
    OrderLineAvailabilityPortRegistry,
    ReservationAvailabilityService,
} from '@mivend/plugin-reservation';
import type {
    LineAvailability,
    OrderLineAvailabilityPort,
    WarehouseAvailability,
} from '@mivend/plugin-reservation';

import { OrderCheckDataService } from './order-check-data.service';
import { lineOrganization, organizationBreakdown } from './order-check-data';

// The single stock-availability function for order lines (#233): the local free quantity of the branch
// warehouses (the reserve's rule) capped by the stock of the line's own organization (the #237 rule).
@Injectable()
export class OrderLineAvailabilityService
    implements OrderLineAvailabilityPort, OnApplicationBootstrap
{
    constructor(
        private connection: TransactionalConnection,
        private subjects: OrderCheckSubjectLoader,
        private data: OrderCheckDataService,
        private availability: ReservationAvailabilityService,
        private warehouseService: WarehouseService,
        private registry: OrderLineAvailabilityPortRegistry,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register(this);
    }

    async forOrder(ctx: RequestContext, orderId: string): Promise<LineAvailability[]> {
        const subject = await this.subjects.load(ctx, orderId);
        if (!subject) return [];
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: orderId } });
        const data = await this.data.load(ctx, subject);
        const locationIds = order?.customFields?.branchId
            ? await this.availability.findBranchStockLocationIds(ctx, order.customFields.branchId)
            : [];
        const freeByLocation = await this.availability.getFreeByLocation(
            ctx,
            [...new Set(subject.lines.map(l => l.productVariantId))],
            locationIds,
        );
        const warehouseOf = await this.warehouseByLocation(ctx, locationIds);
        const names = new Map(
            (await this.warehouseService.findAll(ctx)).map(w => [w.erpId, w.name ?? null]),
        );

        return subject.lines.map(line => {
            const perWarehouse = new Map<string, number>();
            for (const [locationId, free] of freeByLocation.get(line.productVariantId) ?? []) {
                const warehouse = warehouseOf.get(locationId);
                if (warehouse)
                    perWarehouse.set(warehouse, Math.max(perWarehouse.get(warehouse) ?? 0, free));
            }
            const warehouses: WarehouseAvailability[] = [...perWarehouse].map(
                ([warehouseErpId, free]) => ({
                    warehouseErpId,
                    name: names.get(warehouseErpId) ?? null,
                    free,
                }),
            );
            const warehouseFit = Math.max(0, ...warehouses.map(w => w.free));
            const own = lineOrganization(line, data);
            const organizations = own
                ? organizationBreakdown(own.productErpId, own.storage, data).map(o => ({
                      ...o,
                      selling: o.id === own.organizationId,
                  }))
                : [];
            const orgStock = organizations.find(o => o.selling)?.stock ?? null;
            const orgFit =
                orgStock === null
                    ? Infinity
                    : Math.max(0, Math.floor(orgStock * line.storageUnitRatioToBase));
            const available = Math.min(warehouseFit, orgFit);
            const fitting = Math.min(line.quantity, available);
            const limitedBy =
                fitting >= line.quantity
                    ? null
                    : orgFit < warehouseFit
                      ? 'organization'
                      : 'warehouse';
            return {
                lineId: line.lineId,
                needed: line.quantity,
                available,
                fitting,
                limitedBy,
                warehouses,
                organizations,
            };
        });
    }

    private async warehouseByLocation(
        ctx: RequestContext,
        locationIds: string[],
    ): Promise<Map<string, string>> {
        const wanted = new Set(locationIds);
        const rows = await this.connection.getRepository(ctx, StockLocation).find();
        return new Map(
            rows
                .filter(l => wanted.has(String(l.id)) && l.customFields?.warehouseErpId)
                .map(l => [String(l.id), l.customFields.warehouseErpId as string]),
        );
    }
}

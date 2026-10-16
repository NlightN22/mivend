import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

export interface WarehouseAvailability {
    warehouseErpId: string;
    name: string | null;
    free: number;
}

export interface OrganizationAvailability {
    id: string;
    name: string | null;
    stock: number;
    hasContract: boolean;
    selling: boolean;
}

export type AvailabilitySource = 'warehouse' | 'organization';

export interface LineAvailability {
    lineId: string;
    needed: number;
    // What the warehouse and the line's own organization can cover now, uncapped by the ordered quantity.
    available: number;
    // available capped at the ordered quantity: the part of the line that fits.
    fitting: number;
    limitedBy: AvailabilitySource | null;
    warehouses: WarehouseAvailability[];
    organizations: OrganizationAvailability[];
}

// The single stock-availability function for order lines; erp-integration owns the organization
// stock it depends on, so it registers the implementation (like the cancellation port).
export interface OrderLineAvailabilityPort {
    forOrder(ctx: RequestContext, orderId: string): Promise<LineAvailability[]>;
}

@Injectable()
export class OrderLineAvailabilityPortRegistry {
    private port: OrderLineAvailabilityPort | undefined;

    register(port: OrderLineAvailabilityPort): void {
        this.port = port;
    }

    get(): OrderLineAvailabilityPort {
        if (!this.port) {
            throw new Error(
                'No order line availability port registered (erp-integration not loaded)',
            );
        }
        return this.port;
    }
}

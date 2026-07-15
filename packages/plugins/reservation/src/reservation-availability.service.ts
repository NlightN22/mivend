import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    RequestContext,
    StockLevel,
    StockLocation,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// ATP (available-to-promise) read queries — split out of ReservationService to keep that file
// under AGENTS.md's ~300-line guideline. Pure reads, no reservation writes.
@Injectable()
export class ReservationAvailabilityService {
    private cachedStockLocationId: string | undefined;

    constructor(private connection: TransactionalConnection) {}

    async getReservedQuantity(ctx: RequestContext, productVariantId: ID): Promise<number> {
        const stockLocationId = await this.getDefaultStockLocationId(ctx);
        return this.sumActiveReservations(ctx, productVariantId, stockLocationId);
    }

    // ATP = stockOnHand - stockAllocated - activeReservations, all scoped to the single default
    // StockLocation this project uses (no safetyStock term — see docs/order-flow.md "ATP
    // formula (decided)").
    async getAvailableToPromise(ctx: RequestContext, productVariantId: ID): Promise<number> {
        const stockLocationId = await this.getDefaultStockLocationId(ctx);
        const stockLevel = await this.connection
            .getRepository(ctx, StockLevel)
            .findOne({ where: { productVariantId, stockLocationId } });
        const stockOnHand = stockLevel?.stockOnHand ?? 0;
        const stockAllocated = stockLevel?.stockAllocated ?? 0;
        const reserved = await this.sumActiveReservations(ctx, productVariantId, stockLocationId);
        return stockOnHand - stockAllocated - reserved;
    }

    private async sumActiveReservations(
        ctx: RequestContext,
        productVariantId: ID,
        stockLocationId: string,
    ): Promise<number> {
        const rows = await this.connection.getRepository(ctx, Reservation).find({
            where: {
                productVariantId: String(productVariantId),
                stockLocationId,
                status: 'active',
            },
        });
        return rows.reduce((sum, r) => sum + r.quantity, 0);
    }

    private async getDefaultStockLocationId(ctx: RequestContext): Promise<string> {
        if (this.cachedStockLocationId) {
            return this.cachedStockLocationId;
        }
        const location = await this.connection
            .getRepository(ctx, StockLocation)
            .createQueryBuilder()
            .getOne();
        if (!location) {
            throw new UserInputError('No stock location configured');
        }
        this.cachedStockLocationId = String(location.id);
        return this.cachedStockLocationId;
    }
}

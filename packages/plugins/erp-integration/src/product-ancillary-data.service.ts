import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductVariantBarcode } from './entities/product-variant-barcode.entity';
import { ProductCharacteristic } from './entities/product-characteristic.entity';
import { ProductManufacturerCode } from './entities/product-manufacturer-code.entity';
import type { ProductCharacteristicRow } from './product-characteristics-mapper';
import { withAggregateLock } from 'shared';
import type { ManufacturerCodeRow } from './product-ancillary-fields';

// Each event carries the FULL current state, not a delta, so delete-then-insert is idempotent.
// Updates are rare, so the full rewrite is cheap; no diffing needed.
@Injectable()
export class ProductAncillaryDataService {
    constructor(private connection: TransactionalConnection) {}

    async replaceBarcodes(
        ctx: RequestContext,
        productVariantId: string,
        codes: string[],
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, ProductVariantBarcode);
        await repo.delete({ productVariantId });
        if (codes.length === 0) return;
        await repo.save(codes.map(code => repo.create({ productVariantId, code })));
    }

    async replaceCharacteristics(
        ctx: RequestContext,
        productId: string,
        rows: ProductCharacteristicRow[],
    ): Promise<void> {
        // Parallel events of one product would both delete, then both insert (#176).
        await withAggregateLock(
            this.connection,
            ctx,
            `product-characteristics:${productId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, ProductCharacteristic);
                await repo.delete({ productId });
                if (rows.length === 0) return;
                await repo.save(rows.map(row => repo.create({ productId, ...row })));
            },
        );
    }

    async replaceManufacturerCodes(
        ctx: RequestContext,
        productId: string,
        rows: ManufacturerCodeRow[],
    ): Promise<void> {
        await withAggregateLock(
            this.connection,
            ctx,
            `product-manufacturer-codes:${productId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, ProductManufacturerCode);
                await repo.delete({ productId });
                if (rows.length === 0) return;
                await repo.save(rows.map(row => repo.create({ productId, ...row })));
            },
        );
    }
}

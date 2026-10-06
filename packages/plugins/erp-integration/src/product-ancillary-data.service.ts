import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductVariantBarcode } from './entities/product-variant-barcode.entity';
import { ProductCharacteristic } from './entities/product-characteristic.entity';
import { ProductManufacturerCode } from './entities/product-manufacturer-code.entity';
import type { ProductCharacteristicRow } from './product-characteristics-mapper';
import type { ManufacturerCodeRow } from './product-ancillary-fields';

// Replace-all persistence for ProductChanged's per-product/per-variant child rows (issue #116).
// Each ProductChanged event carries the FULL current state of these fields (confirmed with
// Search Platform — not a delta stream), and they change rarely (manual catalog edits in the ERP, not
// price/stock-style high-frequency updates) — a plain delete-then-insert on every event is both
// correct (idempotent on the full-state semantics) and cheap enough at this update frequency, no
// diffing needed.
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
        await this.connection.withTransaction(ctx, async txCtx => {
            const repo = this.connection.getRepository(txCtx, ProductCharacteristic);
            // Parallel events of one product would both delete, then both insert (#176).
            await repo.query('select pg_advisory_xact_lock(hashtext($1))', [
                `product-characteristics:${productId}`,
            ]);
            await repo.delete({ productId });
            if (rows.length === 0) return;
            await repo.save(rows.map(row => repo.create({ productId, ...row })));
        });
    }

    async replaceManufacturerCodes(
        ctx: RequestContext,
        productId: string,
        rows: ManufacturerCodeRow[],
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            const repo = this.connection.getRepository(txCtx, ProductManufacturerCode);
            await repo.query('select pg_advisory_xact_lock(hashtext($1))', [
                `product-manufacturer-codes:${productId}`,
            ]);
            await repo.delete({ productId });
            if (rows.length === 0) return;
            await repo.save(rows.map(row => repo.create({ productId, ...row })));
        });
    }
}

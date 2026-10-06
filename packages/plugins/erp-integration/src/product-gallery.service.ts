import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import DataLoader from 'dataloader';
import {
    ConfigService,
    ProductAsset,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';

const MAX_GALLERY_ITEMS = 10;

// Preview URLs of a product's assets in gallery order, batched per request for search lists.
@Injectable()
export class ProductGalleryService {
    private loaders = new WeakMap<RequestContext, DataLoader<string, string[]>>();

    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
    ) {}

    getPreviews(ctx: RequestContext, productId: ID): Promise<string[]> {
        let loader = this.loaders.get(ctx);
        if (!loader) {
            loader = new DataLoader(async ids => {
                const byProduct = await this.load(ctx, [...ids]);
                return ids.map(id => byProduct.get(id) ?? []);
            });
            this.loaders.set(ctx, loader);
        }
        return loader.load(String(productId));
    }

    private async load(ctx: RequestContext, productIds: string[]): Promise<Map<string, string[]>> {
        const rows = await this.connection.getRepository(ctx, ProductAsset).find({
            where: { productId: In(productIds) },
            relations: { asset: true },
            order: { position: 'ASC' },
        });
        const strategy = this.configService.assetOptions.assetStorageStrategy;
        const byProduct = new Map<string, string[]>();
        for (const row of rows) {
            const key = String(row.productId);
            const list = byProduct.get(key) ?? [];
            if (list.length >= MAX_GALLERY_ITEMS) continue;
            list.push(
                strategy.toAbsoluteUrl
                    ? strategy.toAbsoluteUrl(ctx.req as never, row.asset.preview)
                    : row.asset.preview,
            );
            byProduct.set(key, list);
        }
        return byProduct;
    }
}

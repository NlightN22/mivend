import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import DataLoader from 'dataloader';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

export interface ProductManufacturerView {
    id: ID;
    name: string | null;
}

@Injectable()
export class ProductManufacturerService {
    private loaders = new WeakMap<
        RequestContext,
        DataLoader<string, ProductManufacturerView | null>
    >();

    constructor(private connection: TransactionalConnection) {}

    // Batches the per-product field resolvers of one request into a single query.
    getForProduct(ctx: RequestContext, productId: ID): Promise<ProductManufacturerView | null> {
        let loader = this.loaders.get(ctx);
        if (!loader) {
            loader = new DataLoader(async ids => {
                const byProduct = await this.getForProducts(ctx, [...ids]);
                return ids.map(id => byProduct.get(id) ?? null);
            });
            this.loaders.set(ctx, loader);
        }
        return loader.load(String(productId));
    }

    async getForProducts(
        ctx: RequestContext,
        productIds: string[],
    ): Promise<Map<string, ProductManufacturerView>> {
        const products = await this.connection.getRepository(ctx, Product).find({
            where: { id: In(productIds) },
            relations: { customFields: { manufacturer: true } },
        });
        const result = new Map<string, ProductManufacturerView>();
        for (const product of products) {
            const manufacturer = product.customFields.manufacturer;
            if (manufacturer) {
                result.set(String(product.id), { id: manufacturer.id, name: manufacturer.name });
            }
        }
        return result;
    }
}

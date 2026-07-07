import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { PopularProductsService } from './popular-products.service';
import { PopularProductsResolver } from './popular-products.resolver';
import { shopApiExtensions } from './api/shop.schema';

@VendurePlugin({
    imports: [PluginCommonModule],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [PopularProductsResolver],
    },
    providers: [PopularProductsService],
    compatibility: '>0.0.0',
})
export class PopularProductsPlugin {}

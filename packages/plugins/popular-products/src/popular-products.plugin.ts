import { ReservationPlugin } from '@mivend/plugin-reservation';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { StockScopedIdsService } from './stock-scoped-ids.service';
import { HomeWidgetIdsService } from './home-widget-ids.service';
import { PopularProductsService } from './popular-products.service';
import { PopularProductsResolver } from './popular-products.resolver';
import { shopApiExtensions } from './api/shop.schema';

@VendurePlugin({
    imports: [PluginCommonModule, ReservationPlugin],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [PopularProductsResolver],
    },
    providers: [PopularProductsService, HomeWidgetIdsService, StockScopedIdsService],
    compatibility: '>0.0.0',
})
export class PopularProductsPlugin {}

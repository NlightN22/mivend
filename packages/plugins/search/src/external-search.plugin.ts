import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { externalSearchSchema } from './external-search.schema';
import { ExternalAdminSearchResolver, ExternalSearchResolver } from './external-search.resolver';
import { ExternalSearchService } from './external-search.service';
import { ProductLookupService } from './product-lookup.service';
import { SearchFilterResolver } from './search-filter-resolver.service';
import { SearchPriceTypeService } from './search-price-type.service';
import { SearchServiceClient } from './search-service.client';

// Registered only when SEARCH_BACKEND=external (issue #69) — supplies the shop-api `search`
// query against search-service, replacing the seam ElasticsearchPlugin fills for the internal
// backend. Never registered alongside ElasticsearchPlugin. See search.plugin.ts.
@VendurePlugin({
    imports: [PluginCommonModule, ReservationPlugin, PriceEntryPlugin, AccessControlPlugin],
    shopApiExtensions: {
        schema: externalSearchSchema,
        resolvers: [ExternalSearchResolver],
    },
    adminApiExtensions: {
        resolvers: [ExternalAdminSearchResolver],
    },
    providers: [
        SearchServiceClient,
        ProductLookupService,
        SearchFilterResolver,
        SearchPriceTypeService,
        ExternalSearchService,
    ],
    compatibility: '>0.0.0',
})
export class ExternalSearchPlugin {}

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

// Never register alongside ElasticsearchPlugin: both fill the same search seam.
// The seam's contract is defined in search.plugin.ts.
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

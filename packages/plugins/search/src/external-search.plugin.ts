import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { ExternalSearchResolver } from './external-search.resolver';
import { ExternalSearchService } from './external-search.service';
import { ProductLookupService } from './product-lookup.service';
import { SearchServiceClient } from './search-service.client';

// Registered only when SEARCH_BACKEND=external (issue #69) — supplies the shop-api `search`
// query against search-service, replacing the seam ElasticsearchPlugin fills for the internal
// backend. Never registered alongside ElasticsearchPlugin. See search.plugin.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    shopApiExtensions: {
        resolvers: [ExternalSearchResolver],
    },
    providers: [SearchServiceClient, ProductLookupService, ExternalSearchService],
    compatibility: '>0.0.0',
})
export class ExternalSearchPlugin {}

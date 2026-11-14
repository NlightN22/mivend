import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';

import {
    AdminCodeMatchesResolver,
    ShopCodeMatchesResolver,
} from './internal-code-matches.resolver';
import { InternalShopSearchResolver } from './internal-shop-search.resolver';
import { CategorySubtreeService } from './category-subtree.service';
import { InternalCodeMatchesService } from './internal-code-matches.service';

// Also owns the shop `search` query (hidden categories). Registered only for SEARCH_BACKEND=internal; the external backend returns the groups on the parent.
@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin],
    providers: [InternalCodeMatchesService, CategorySubtreeService],
    shopApiExtensions: { resolvers: [ShopCodeMatchesResolver, InternalShopSearchResolver] },
    adminApiExtensions: { resolvers: [AdminCodeMatchesResolver] },
    compatibility: '>0.0.0',
})
export class InternalCodeMatchesPlugin {}

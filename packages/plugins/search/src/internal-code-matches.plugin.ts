import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import {
    AdminCodeMatchesResolver,
    ShopCodeMatchesResolver,
} from './internal-code-matches.resolver';
import { InternalCodeMatchesService } from './internal-code-matches.service';

// Registered only for SEARCH_BACKEND=internal; the external backend returns the groups on the parent.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [InternalCodeMatchesService],
    shopApiExtensions: { resolvers: [ShopCodeMatchesResolver] },
    adminApiExtensions: { resolvers: [AdminCodeMatchesResolver] },
    compatibility: '>0.0.0',
})
export class InternalCodeMatchesPlugin {}

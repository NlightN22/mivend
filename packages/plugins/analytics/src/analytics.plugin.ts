import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { AnalyticsResolver } from './analytics.resolver';
import { adminApiSchema } from './analytics.schema';

@VendurePlugin({
    imports: [PluginCommonModule],
    adminApiExtensions: { schema: adminApiSchema, resolvers: [AnalyticsResolver] },
    compatibility: '>0.0.0',
})
export class AnalyticsPlugin {}

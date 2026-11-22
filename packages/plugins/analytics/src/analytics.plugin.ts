import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { AnalyticsResolver } from './analytics.resolver';
import { adminApiSchema } from './analytics.schema';
import { OrderAnalyticsLabelsService } from './order-analytics/order-analytics-labels.service';
import { OrderAnalyticsResolver } from './order-analytics/order-analytics.resolver';
import { OrderAnalyticsScopeService } from './order-analytics/order-analytics-scope.service';
import { OrderAnalyticsService } from './order-analytics/order-analytics.service';
import { OrderMetricsClient } from './order-analytics/order-metrics.client';
import { ANALYTICS_PLUGIN_OPTIONS } from './types';
import type { AnalyticsPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin, AccessControlPlugin],
    providers: [
        { provide: ANALYTICS_PLUGIN_OPTIONS, useFactory: () => AnalyticsPlugin.options },
        OrderMetricsClient,
        OrderAnalyticsScopeService,
        OrderAnalyticsLabelsService,
        OrderAnalyticsService,
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [AnalyticsResolver, OrderAnalyticsResolver],
    },
    compatibility: '>0.0.0',
})
export class AnalyticsPlugin {
    static options: AnalyticsPluginOptions = {};

    static init(options: AnalyticsPluginOptions): Type<AnalyticsPlugin> {
        this.options = options;
        return AnalyticsPlugin;
    }
}

import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { AnalyticsResolver } from './analytics.resolver';
import { adminApiSchema } from './analytics.schema';
import { OrderAnalyticsGroupsResolver } from './order-analytics/order-analytics-groups.resolver';
import { OrderAnalyticsGroupsService } from './order-analytics/order-analytics-groups.service';
import { OrderAnalyticsEntityNamesService } from './order-analytics/order-analytics-entity-names.service';
import { SalesCurrencyResolverService } from './sales-analytics/sales-currency-resolver.service';
import { OrderAnalyticsFilterValuesService } from './order-analytics/order-analytics-filter-values.service';
import { OrderAnalyticsLabelsService } from './order-analytics/order-analytics-labels.service';
import { OrderAnalyticsResolver } from './order-analytics/order-analytics.resolver';
import { OrderAnalyticsScopeService } from './order-analytics/order-analytics-scope.service';
import { OrderAnalyticsService } from './order-analytics/order-analytics.service';
import { OrderMetricsClient } from './order-analytics/order-metrics.client';
import { SalesAnalyticsResolver } from './sales-analytics/sales-analytics.resolver';
import { SalesAnalyticsService } from './sales-analytics/sales-analytics.service';
import { SalesMetricsClient } from './sales-analytics/sales-metrics.client';
import { ANALYTICS_PLUGIN_OPTIONS } from './types';
import type { AnalyticsPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin, AccessControlPlugin],
    providers: [
        { provide: ANALYTICS_PLUGIN_OPTIONS, useFactory: () => AnalyticsPlugin.options },
        OrderMetricsClient,
        OrderAnalyticsScopeService,
        OrderAnalyticsLabelsService,
        SalesCurrencyResolverService,
        OrderAnalyticsEntityNamesService,
        OrderAnalyticsGroupsService,
        OrderAnalyticsService,
        OrderAnalyticsFilterValuesService,
        SalesMetricsClient,
        SalesAnalyticsService,
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [
            AnalyticsResolver,
            OrderAnalyticsResolver,
            OrderAnalyticsGroupsResolver,
            SalesAnalyticsResolver,
        ],
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

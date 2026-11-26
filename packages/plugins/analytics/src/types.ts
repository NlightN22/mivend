import type { ChannelCredentials } from '@grpc/grpc-js';

export interface AnalyticsPluginOptions {
    orderMetricsAddress?: string;
    // Path of the file holding the bearer key, never the key itself.
    orderMetricsKeyFile?: string;
    // TLS by default; a test passes insecure credentials for its in-process server.
    orderMetricsCredentials?: ChannelCredentials;
    // Plain-text channel for the access-test double; the server config never enables it in production.
    orderMetricsInsecure?: boolean;
    // The analytics service has not deployed category and customer group filters yet; off sends and offers none.
    productCategoryAndCustomerGroupFilters?: boolean;
}

export const ANALYTICS_PLUGIN_OPTIONS = Symbol('ANALYTICS_PLUGIN_OPTIONS');
export const loggerCtx = 'AnalyticsPlugin';

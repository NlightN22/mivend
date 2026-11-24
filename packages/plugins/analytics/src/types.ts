import type { ChannelCredentials } from '@grpc/grpc-js';

export interface AnalyticsPluginOptions {
    orderMetricsAddress?: string;
    // Path of the file holding the bearer key, never the key itself.
    orderMetricsKeyFile?: string;
    // TLS by default; a test passes insecure credentials for its in-process server.
    orderMetricsCredentials?: ChannelCredentials;
    // Plain-text channel for the access-test double; the server config enables it only under NODE_ENV=test.
    orderMetricsInsecure?: boolean;
}

export const ANALYTICS_PLUGIN_OPTIONS = Symbol('ANALYTICS_PLUGIN_OPTIONS');
export const loggerCtx = 'AnalyticsPlugin';

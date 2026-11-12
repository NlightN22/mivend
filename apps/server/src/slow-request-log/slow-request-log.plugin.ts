import type { OnApplicationShutdown } from '@nestjs/common';
import { Logger, PluginCommonModule, VendurePlugin, type ApiOptions } from '@vendure/core';

import { startLagMonitor, type LagMonitor } from './event-loop-lag';
import { createInFlightOperations } from './in-flight';
import {
    actorLabel,
    envMs,
    formatSlowOperation,
    isSlow,
    requestContextOf,
} from './slow-request-log';

type ApolloServerPlugin = NonNullable<ApiOptions['apolloServerPlugins']>[number];

const loggerCtx = 'slow-request';
const inFlight = createInFlightOperations();

function slowRequestApolloPlugin(thresholdMs: number): ApolloServerPlugin {
    return {
        async requestDidStart() {
            const startedAt = performance.now();
            let finish: (() => void) | undefined;
            return {
                async didResolveOperation(rc) {
                    finish = inFlight.start(rc.operationName, startedAt);
                },
                async willSendResponse(rc) {
                    finish?.();
                    const duration = performance.now() - startedAt;
                    if (!isSlow(duration, thresholdMs)) return;
                    const ctx = requestContextOf(rc.contextValue);
                    const api = (ctx as { apiType?: string } | undefined)?.apiType ?? 'graphql';
                    Logger.warn(
                        formatSlowOperation(api, rc.operationName, duration, actorLabel(ctx)),
                        loggerCtx,
                    );
                },
            };
        },
    };
}

@VendurePlugin({
    imports: [PluginCommonModule],
    configuration: config => {
        const thresholdMs = envMs(process.env.SLOW_REQUEST_LOG_MS, 500);
        config.apiOptions.apolloServerPlugins = [
            ...(config.apiOptions.apolloServerPlugins ?? []),
            slowRequestApolloPlugin(thresholdMs),
        ];
        return config;
    },
})
export class SlowRequestLogPlugin implements OnApplicationShutdown {
    private monitor: LagMonitor | undefined;

    onApplicationBootstrap(): void {
        const thresholdMs = envMs(process.env.EVENT_LOOP_LAG_LOG_MS, 1000);
        this.monitor = startLagMonitor(thresholdMs, lag =>
            Logger.warn(
                `event loop was blocked for about ${lag} ms; ${inFlight.describe(performance.now())}`,
                loggerCtx,
            ),
        );
    }

    onApplicationShutdown(): void {
        this.monitor?.stop();
    }
}

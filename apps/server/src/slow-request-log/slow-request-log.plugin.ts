import type { OnApplicationShutdown } from '@nestjs/common';
import { Logger, PluginCommonModule, VendurePlugin, type ApiOptions } from '@vendure/core';

import { startLagMonitor, type LagMonitor } from './event-loop-lag';
import {
    actorLabel,
    envMs,
    formatSlowOperation,
    isSlow,
    type ActorContext,
} from './slow-request-log';

type ApolloServerPlugin = NonNullable<ApiOptions['apolloServerPlugins']>[number];

const loggerCtx = 'slow-request';

function requestContextOf(contextValue: unknown): ActorContext | undefined {
    const req = (contextValue as { req?: Record<string, unknown> } | undefined)?.req;
    return req?.['vendureRequestContext'] as ActorContext | undefined;
}

function slowRequestApolloPlugin(thresholdMs: number): ApolloServerPlugin {
    return {
        async requestDidStart() {
            const startedAt = Date.now();
            return {
                async willSendResponse(rc) {
                    const duration = Date.now() - startedAt;
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
            Logger.warn(`event loop was blocked for about ${lag} ms`, loggerCtx),
        );
    }

    onApplicationShutdown(): void {
        this.monitor?.stop();
    }
}

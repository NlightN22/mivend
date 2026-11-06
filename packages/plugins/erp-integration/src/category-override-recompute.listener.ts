import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
    CollectionEvent,
    CollectionService,
    EventBus,
    FacetService,
    FacetValueService,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { recomputeCategoryTree, subscribeAndLog } from 'shared';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const MAX_LOCK_RETRY_MS = 30 * 60 * 1000;

const isLockTimeout = (error: unknown): boolean => {
    const e = error as { code?: unknown; driverError?: { code?: unknown } } | null;
    return e?.code === '55P03' || e?.driverError?.code === '55P03';
};

// A manual override changes one Collection; its subtree (and a cleared override's own state)
// follows from the same recompute the feed uses, so it takes effect now, not at the next sweep.
@Injectable()
export class CategoryOverrideRecomputeListener implements OnApplicationBootstrap {
    private running: Promise<void> | null = null;
    private rerun = false;
    private readonly logger = new Logger(CategoryOverrideRecomputeListener.name);

    constructor(
        private readonly eventBus: EventBus,
        private readonly requestContextService: RequestContextService,
        private readonly connection: TransactionalConnection,
        private readonly collectionService: CollectionService,
        private readonly facetService: FacetService,
        private readonly facetValueService: FacetValueService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;
        subscribeAndLog(
            this.eventBus,
            CollectionEvent,
            event => this.handle(event),
            CategoryOverrideRecomputeListener.name,
        );
    }

    async handle(event: CollectionEvent): Promise<void> {
        if (event.type !== 'updated') return;
        const input = event.input as
            | { customFields?: { visibilityOverride?: unknown } }
            | undefined;
        if (input?.customFields?.visibilityOverride === undefined) return;

        if (this.running) {
            this.rerun = true;
            return this.running;
        }
        this.running = this.recomputeUntilSettled().finally(() => {
            this.running = null;
        });
        return this.running;
    }

    private async recomputeUntilSettled(): Promise<void> {
        const startedAt = Date.now();
        let lockRetries = 0;
        do {
            this.rerun = false;
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            try {
                await recomputeCategoryTree(ctx, {
                    connection: this.connection,
                    collectionService: this.collectionService,
                    facetService: this.facetService,
                    facetValueService: this.facetValueService,
                });
            } catch (error) {
                const elapsedMs = Date.now() - startedAt;
                if (!isLockTimeout(error) || elapsedMs >= MAX_LOCK_RETRY_MS) {
                    this.rerun = false;
                    throw error;
                }
                lockRetries += 1;
                this.logger.warn(
                    `Tree lock timeout, retry ${lockRetries} after ${Math.round(elapsedMs / 1000)} s`,
                );
                this.rerun = true;
            }
        } while (this.rerun);
    }
}

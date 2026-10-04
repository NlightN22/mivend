import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
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

// A manual override changes one Collection; its subtree (and a cleared override's own state)
// follows from the same recompute the feed uses, so it takes effect now, not at the next sweep.
@Injectable()
export class CategoryOverrideRecomputeListener implements OnApplicationBootstrap {
    private running: Promise<void> | null = null;
    private rerun = false;

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
        do {
            this.rerun = false;
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            await recomputeCategoryTree(ctx, {
                connection: this.connection,
                collectionService: this.collectionService,
                facetService: this.facetService,
                facetValueService: this.facetValueService,
            });
        } while (this.rerun);
    }
}

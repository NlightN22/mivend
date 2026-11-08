import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { BulkBatchQueryService, type ItemListOptions } from './bulk-batch-query.service';
import { BulkBatchService } from './bulk-batch.service';
import { toBulkBatch, type BulkBatchDto } from './bulk-batch.mapper';
import type { BatchListOptions } from './bulk-batch-list-filter';
import { BulkExecutorRegistry } from './bulk-executor-registry';
import type { BulkItemRow } from './types';

// Every operation has its own permission, checked per call by the registry, not by @Allow.
@Resolver()
export class BulkOperationsResolver {
    constructor(
        private registry: BulkExecutorRegistry,
        private batches: BulkBatchService,
        private queries: BulkBatchQueryService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    bulkOperationCatalog(@Ctx() ctx: RequestContext): Array<Record<string, unknown>> {
        return this.registry.allowed(ctx).map(e => ({
            type: e.type,
            title: e.title,
            description: e.description,
            area: e.area,
            undoable: e.undoPlan != null,
        }));
    }

    @Query()
    @Allow(Permission.Authenticated)
    async bulkBatches(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: BatchListOptions },
    ): Promise<{ items: BulkBatchDto[]; totalItems: number }> {
        const { items, totalItems } = await this.queries.list(ctx, args.options ?? {});
        return {
            items: items.map(b => toBulkBatch(b, this.registry.get(b.operationType))),
            totalItems,
        };
    }

    @Query()
    @Allow(Permission.Authenticated)
    async bulkBatch(
        @Ctx() ctx: RequestContext,
        @Args() args: { uuid: string },
    ): Promise<BulkBatchDto> {
        const batch = await this.queries.get(ctx, args.uuid);
        return toBulkBatch(batch, this.registry.get(batch.operationType));
    }

    @Query()
    @Allow(Permission.Authenticated)
    async bulkBatchItems(
        @Ctx() ctx: RequestContext,
        @Args() args: { uuid: string; options?: ItemListOptions },
    ): Promise<{ items: BulkItemRow[]; totalItems: number }> {
        return this.queries.items(ctx, args.uuid, args.options ?? {});
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async previewBulkBatch(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { type: string; parameters?: Record<string, unknown>; selection: { ids: string[] } },
    ): Promise<BulkBatchDto> {
        const batch = await this.batches.preview(
            ctx,
            args.type,
            args.parameters ?? {},
            args.selection.ids,
        );
        return this.scopedDto(ctx, batch.uuid);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async runBulkBatch(
        @Ctx() ctx: RequestContext,
        @Args() args: { uuid: string },
    ): Promise<BulkBatchDto> {
        const batch = await this.batches.run(ctx, args.uuid);
        return this.scopedDto(ctx, batch.uuid);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async undoBulkBatch(
        @Ctx() ctx: RequestContext,
        @Args() args: { uuid: string },
    ): Promise<BulkBatchDto> {
        const batch = await this.batches.undo(ctx, args.uuid);
        return this.scopedDto(ctx, batch.uuid);
    }

    private async scopedDto(ctx: RequestContext, uuid: string): Promise<BulkBatchDto> {
        const batch = await this.queries.get(ctx, uuid);
        return toBulkBatch(batch, this.registry.get(batch.operationType));
    }
}

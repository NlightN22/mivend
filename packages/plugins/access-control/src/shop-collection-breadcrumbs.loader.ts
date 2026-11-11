import { Injectable } from '@nestjs/common';
import {
    Collection,
    CollectionService,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
} from '@vendure/core';
import { CtxLoader, ctxQuery } from 'shared';
import { In } from 'typeorm';

import { dropPrivateAncestors } from './shop-collection-breadcrumbs';

export interface BreadcrumbItem {
    id: string | number;
    name: string;
    slug: string;
}

const MAX_DEPTH = 64;
const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

// Resolves the breadcrumbs of every collection of a request with one ancestry query and one entity load.
@Injectable()
export class ShopCollectionBreadcrumbsLoader {
    private loader = new CtxLoader<BreadcrumbItem[]>((ctx, keys) => this.loadBatch(ctx, keys));

    constructor(
        private collectionService: CollectionService,
        private connection: TransactionalConnection,
        private translator: TranslatorService,
    ) {}

    load(ctx: RequestContext, collection: Collection): Promise<BreadcrumbItem[]> {
        return this.loader.load(ctx, collection.id);
    }

    private async loadBatch(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<BreadcrumbItem[] | Error>> {
        const chains = await this.loadChains(ctx, keys);
        const ids = [...new Set([...chains.values()].flat())];
        const entities = await this.connection
            .getRepository(ctx, Collection)
            .find({ where: { id: In(ids) } });
        const byId = new Map(entities.map(entity => [String(entity.id), entity]));
        return Promise.all(keys.map(key => this.crumbsFor(ctx, key, chains, byId).catch(asError)));
    }

    private async crumbsFor(
        ctx: RequestContext,
        key: string,
        chains: Map<string, string[]>,
        byId: Map<string, Collection>,
    ): Promise<BreadcrumbItem[]> {
        const chain = (chains.get(key) ?? []).map(id => byId.get(id));
        if (chain.length === 0 || chain.some(entity => !entity)) {
            return this.coreBreadcrumbs(ctx, key);
        }
        const nodes = chain as Collection[];
        if (!nodes[0].isRoot) return this.coreBreadcrumbs(ctx, key);
        const crumbs = nodes.map(node => {
            const { id, name, slug } = this.translator.translate(node, ctx);
            return { id, name, slug };
        });
        if (crumbs.length < 3) return crumbs;
        const hidden = new Set(
            nodes
                .slice(1, -1)
                .filter(n => n.isPrivate)
                .map(n => String(n.id)),
        );
        return dropPrivateAncestors(crumbs, hidden);
    }

    // Ids from the root down to the collection; empty when the chain cannot be followed.
    private async loadChains(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Map<string, string[]>> {
        // unbounded-ok: ancestor chains of the collection ids passed in, depth capped by MAX_DEPTH
        const rows = await ctxQuery<Array<{ leaf: number; node: number }>>(
            this.connection,
            ctx,
            `WITH RECURSIVE chain AS (
                 SELECT c.id AS leaf, c.id AS node, c."parentId" AS parent, c."isRoot" AS root, 0 AS depth
                 FROM collection c WHERE c.id = ANY($1::int[])
                 UNION ALL
                 SELECT chain.leaf, p.id, p."parentId", p."isRoot", chain.depth + 1
                 FROM chain JOIN collection p ON p.id = chain.parent
                 WHERE NOT chain.root AND chain.depth < ${MAX_DEPTH}
             )
             SELECT leaf, node FROM chain ORDER BY leaf, depth DESC`,
            [keys.map(Number)],
        );
        const chains = new Map<string, string[]>();
        for (const { leaf, node } of rows) {
            const list = chains.get(String(leaf)) ?? [];
            list.push(String(node));
            chains.set(String(leaf), list);
        }
        return chains;
    }

    private async coreBreadcrumbs(ctx: RequestContext, key: string): Promise<BreadcrumbItem[]> {
        const collection = await this.connection.getEntityOrThrow(ctx, Collection, key);
        return this.collectionService.getBreadcrumbs(
            ctx,
            this.translator.translate(collection, ctx),
        );
    }
}

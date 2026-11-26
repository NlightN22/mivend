import { Injectable } from '@nestjs/common';
import {
    Collection,
    CollectionService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { CATEGORY_SLUG_PREFIX, categoryErpIdFromSlug } from 'shared';
import { In, type Repository } from 'typeorm';

import type { GroupFilterKind } from './order-analytics-group-filters';

export interface GroupOption {
    // Our own entity id; the ERP id of a group never reaches the browser.
    id: string;
    // The group's name with its parents, e.g. `Parent / Child`.
    name: string;
}

interface TreeRow {
    id: number | string;
    erpId: string;
    name: string | null;
    parentErpId: string | null;
}

export const GROUP_SUGGEST_LIMIT = 10;
const MAX_DEPTH = 32;
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, m => `\\${m}`);
const numericIds = (ids: string[]): number[] => ids.filter(id => /^\d{1,15}$/.test(id)).map(Number);

// Group trees mivend already holds: manufacturer parents, the category collections and the counterparty groups.
@Injectable()
export class OrderAnalyticsGroupsService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly collections: CollectionService,
    ) {}

    async suggest(
        ctx: RequestContext,
        kind: GroupFilterKind,
        prefix: string,
    ): Promise<GroupOption[]> {
        const text = prefix.trim();
        if (text.length < 2) return [];
        const like = `%${escapeLike(text)}%`;
        if (kind === 'PRODUCT_CATEGORY') return this.categories(ctx, like);
        const rows = await this.treeRows(ctx, kind, like);
        return this.withPaths(ctx, kind, rows);
    }

    async erpIds(ctx: RequestContext, kind: GroupFilterKind, ids: string[]): Promise<string[]> {
        const wanted = numericIds(ids);
        if (wanted.length === 0) return [];
        if (kind === 'PRODUCT_CATEGORY') {
            const found = await this.connection
                .getRepository(ctx, Collection)
                .createQueryBuilder('c')
                .innerJoinAndSelect('c.translations', 't')
                .where('c.id IN (:...wanted)', { wanted })
                .take(wanted.length)
                .getMany();
            const slugs = found.flatMap(c => c.translations.map(t => t.slug));
            return [...new Set(slugs.map(categoryErpIdFromSlug))].filter(
                (id): id is string => !!id,
            );
        }
        const rows = await this.repo(ctx, kind).find({
            where: { id: In(wanted), ...this.live(kind) },
            take: wanted.length,
        });
        return rows.map(r => (kind === 'MANUFACTURER_GROUP' ? r.externalId : r.erpId));
    }

    private repo(ctx: RequestContext, kind: GroupFilterKind): Repository<Record<string, string>> {
        return this.connection.getRepository<Record<string, string>>(
            ctx,
            kind === 'MANUFACTURER_GROUP' ? 'Manufacturer' : 'CounterpartyGroupErp',
        );
    }

    private live(kind: GroupFilterKind): Record<string, boolean> {
        return kind === 'MANUFACTURER_GROUP' ? { isActive: true } : { isDeleted: false };
    }

    private async categories(ctx: RequestContext, like: string): Promise<GroupOption[]> {
        const found = await this.connection
            .getRepository(ctx, Collection)
            .createQueryBuilder('c')
            .innerJoinAndSelect('c.translations', 't')
            .where('t.slug LIKE :prefix', { prefix: `${CATEGORY_SLUG_PREFIX}%` })
            .andWhere("t.name ILIKE :like ESCAPE '\\'", { like })
            .orderBy('t.name', 'ASC')
            .take(GROUP_SUGGEST_LIMIT)
            .getMany();
        const options: GroupOption[] = [];
        for (const category of found) {
            const trail = await this.collections.getBreadcrumbs(ctx, category);
            options.push({
                id: String(category.id),
                name: trail
                    .slice(1)
                    .map(b => b.name)
                    .join(' / '),
            });
        }
        return options;
    }

    private async treeRows(
        ctx: RequestContext,
        kind: GroupFilterKind,
        like: string,
    ): Promise<TreeRow[]> {
        const manufacturers = kind === 'MANUFACTURER_GROUP';
        const rows = await this.repo(ctx, kind)
            .createQueryBuilder('g')
            .where("g.name ILIKE :like ESCAPE '\\'", { like })
            .andWhere(`g.${manufacturers ? 'isActive = true' : 'isDeleted = false'}`)
            .orderBy('g.name', 'ASC')
            .take(GROUP_SUGGEST_LIMIT)
            .getMany();
        return rows.map(r => this.toTreeRow(kind, r));
    }

    private toTreeRow(kind: GroupFilterKind, r: Record<string, string>): TreeRow {
        const manufacturers = kind === 'MANUFACTURER_GROUP';
        return {
            id: r.id,
            erpId: manufacturers ? r.externalId : r.erpId,
            name: r.name,
            parentErpId: (manufacturers ? r.parentExternalId : r.parentId) || null,
        };
    }

    private async withPaths(
        ctx: RequestContext,
        kind: GroupFilterKind,
        rows: TreeRow[],
    ): Promise<GroupOption[]> {
        const known = new Map<string, TreeRow>(rows.map(r => [r.erpId, r]));
        let missing = new Set(rows.map(r => r.parentErpId).filter((p): p is string => !!p));
        for (let depth = 0; depth < MAX_DEPTH && missing.size > 0; depth++) {
            const wanted = [...missing].filter(id => !known.has(id));
            if (wanted.length === 0) break;
            const key = kind === 'MANUFACTURER_GROUP' ? 'externalId' : 'erpId';
            const parents = await this.repo(ctx, kind).find({
                where: { [key]: In(wanted) },
                take: wanted.length,
            });
            missing = new Set();
            for (const parent of parents.map(p => this.toTreeRow(kind, p))) {
                known.set(parent.erpId, parent);
                if (parent.parentErpId) missing.add(parent.parentErpId);
            }
            for (const id of wanted)
                if (!known.has(id))
                    known.set(id, { id: '', erpId: id, name: null, parentErpId: null });
        }
        return rows.map(row => {
            const names: string[] = [];
            const seen = new Set<string>();
            for (
                let at: TreeRow | undefined = row;
                at && !seen.has(at.erpId) && names.length < MAX_DEPTH;
                at = at.parentErpId ? known.get(at.parentErpId) : undefined
            ) {
                seen.add(at.erpId);
                if (at.name) names.unshift(at.name);
            }
            return { id: String(row.id), name: names.join(' / ') };
        });
    }
}

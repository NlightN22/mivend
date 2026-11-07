import { Injectable } from '@nestjs/common';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    AdministratorService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { withAggregateLock } from 'shared';

import { SavedTableView, SavedTableViewScope } from './entities/saved-table-view.entity';

export interface SaveTableViewInput {
    pageKey: string;
    name: string;
    filters: string;
    visibleColumns: string[];
    scope?: SavedTableViewScope;
}

export interface UpdateTableViewInput {
    id: string;
    name?: string;
    filters?: string;
    visibleColumns?: string[];
}

@Injectable()
export class SavedViewsService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
    ) {}

    // Views only store UI state (filters, columns), never data, so every staff member reads shared ones.
    async findForCurrentAdministrator(
        ctx: RequestContext,
        pageKey: string,
    ): Promise<SavedTableView[]> {
        const administratorId = await this.requireAdministratorId(ctx);
        return this.connection.getRepository(ctx, SavedTableView).find({
            where: [
                { administratorId, pageKey, scope: 'PERSONAL' },
                { pageKey, scope: 'SHARED' },
            ],
            order: { createdAt: 'DESC' },
        });
    }

    async save(ctx: RequestContext, input: SaveTableViewInput): Promise<SavedTableView> {
        const administratorId = await this.requireAdministratorId(ctx);
        const scope = input.scope ?? 'PERSONAL';
        if (scope === 'SHARED') this.requireManageShared(ctx);
        const view = new SavedTableView({
            administratorId,
            pageKey: input.pageKey,
            name: input.name,
            filters: input.filters,
            visibleColumns: input.visibleColumns,
            scope,
            isDefault: false,
        });
        return this.connection.getRepository(ctx, SavedTableView).save(view);
    }

    // One UPDATE keyed by id, scope and owner: rename and state change are atomic, and a foreign
    // personal view is a silent no-op (null) rather than a leak of whether the id exists.
    async update(ctx: RequestContext, input: UpdateTableViewInput): Promise<SavedTableView | null> {
        const where = await this.writableWhere(ctx, input.id);
        if (!where) return null;
        const repo = this.connection.getRepository(ctx, SavedTableView);
        const patch: Partial<SavedTableView> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.filters !== undefined) patch.filters = input.filters;
        if (input.visibleColumns !== undefined) patch.visibleColumns = input.visibleColumns;
        if (Object.keys(patch).length > 0) await repo.update(where, patch);
        return repo.findOne({ where });
    }

    // GraphQL ids arrive as the entity id strategy's native type (number here); String() them first.
    async delete(ctx: RequestContext, id: string): Promise<boolean> {
        const where = await this.writableWhere(ctx, id);
        if (!where) return false;
        const result = await this.connection.getRepository(ctx, SavedTableView).delete(where);
        return (result.affected ?? 0) > 0;
    }

    // Clearing the old default and setting the new one happen under one per-list lock in one
    // transaction, so concurrent callers leave exactly one default (docs/concurrency.md).
    async setDefault(
        ctx: RequestContext,
        id: string,
        isDefault: boolean,
    ): Promise<SavedTableView | null> {
        this.requireManageShared(ctx);
        const key = String(id);
        const target = await this.connection
            .getRepository(ctx, SavedTableView)
            .findOne({ where: { id: key as unknown as number, scope: 'SHARED' } });
        if (!target) return null;
        return withAggregateLock(
            this.connection,
            ctx,
            `table-view-default:${target.pageKey}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, SavedTableView);
                const locked = await repo.findOne({
                    where: { id: key as unknown as number, scope: 'SHARED' },
                });
                if (!locked) return null;
                await repo.update(
                    { pageKey: locked.pageKey, isDefault: true },
                    { isDefault: false },
                );
                if (isDefault) await repo.update({ id: locked.id }, { isDefault: true });
                return repo.findOne({ where: { id: locked.id } });
            },
        );
    }

    private async writableWhere(
        ctx: RequestContext,
        id: string,
    ): Promise<{ id: number; scope: SavedTableViewScope; administratorId?: string } | null> {
        const administratorId = await this.requireAdministratorId(ctx);
        const numericId = String(id) as unknown as number;
        const view = await this.connection
            .getRepository(ctx, SavedTableView)
            .findOne({ where: { id: numericId } });
        if (!view) return null;
        if (view.scope === 'SHARED') {
            this.requireManageShared(ctx);
            return { id: numericId, scope: 'SHARED' };
        }
        if (view.administratorId !== administratorId) return null;
        return { id: numericId, scope: 'PERSONAL', administratorId };
    }

    private requireManageShared(ctx: RequestContext): void {
        if (!ctx.userHasPermissions([CustomPermission.ManageSharedTableViews.Permission])) {
            throw new ForbiddenError();
        }
    }

    private async requireAdministratorId(ctx: RequestContext): Promise<string> {
        const administratorId = await this.getAdministratorId(ctx);
        if (!administratorId) {
            throw new Error('No active administrator for this request');
        }
        return administratorId;
    }

    private async getAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}

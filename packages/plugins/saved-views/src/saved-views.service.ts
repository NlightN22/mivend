import { Injectable } from '@nestjs/common';
import { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { SavedTableView } from './entities/saved-table-view.entity';

export interface SaveTableViewInput {
    pageKey: string;
    name: string;
    filters: string;
    visibleColumns: string[];
}

@Injectable()
export class SavedViewsService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
    ) {}

    async findForCurrentAdministrator(
        ctx: RequestContext,
        pageKey: string,
    ): Promise<SavedTableView[]> {
        const administratorId = await this.requireAdministratorId(ctx);
        return this.connection.getRepository(ctx, SavedTableView).find({
            where: { administratorId, pageKey },
            order: { createdAt: 'DESC' },
        });
    }

    async save(ctx: RequestContext, input: SaveTableViewInput): Promise<SavedTableView> {
        const administratorId = await this.requireAdministratorId(ctx);
        const view = new SavedTableView({
            administratorId,
            pageKey: input.pageKey,
            name: input.name,
            filters: input.filters,
            visibleColumns: input.visibleColumns,
        });
        return this.connection.getRepository(ctx, SavedTableView).save(view);
    }

    // Admin scoping is in the delete WHERE clause, not a separate check, so a foreign admin's id
    // is a silent no-op; throwing would leak whether the id exists.
    async delete(ctx: RequestContext, id: string): Promise<boolean> {
        const administratorId = await this.requireAdministratorId(ctx);
        // GraphQL input ids arrive as the entity id strategy's native type (number here), not string;
        // String() them before comparing or persisting.
        const result = await this.connection
            .getRepository(ctx, SavedTableView)
            .delete({ id: String(id) as unknown as number, administratorId });
        return (result.affected ?? 0) > 0;
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

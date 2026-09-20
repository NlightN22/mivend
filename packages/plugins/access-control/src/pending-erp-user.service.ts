import { Injectable } from '@nestjs/common';
import {
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { PendingErpUser } from './entities/pending-erp-user.entity';

export interface PendingErpUserInput {
    erpId: string;
    fullName?: string | null;
    email?: string | null;
    departmentId?: string | null;
}

// Issue #119: the "unlinked 1C user" candidate list — see PendingErpUser's own comment.
@Injectable()
export class PendingErpUserService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // Called on every UserChanged event that fails to match an existing Administrator by email
    // — idempotent, keeps the row's fields/lastSeenAt current for whoever reviews the list.
    async upsert(ctx: RequestContext, input: PendingErpUserInput): Promise<PendingErpUser> {
        const repo = this.connection.getRepository(ctx, PendingErpUser);
        const now = new Date();
        let pending = await repo.findOne({ where: { erpId: input.erpId } });
        if (pending) {
            if (input.fullName !== undefined) pending.fullName = input.fullName;
            if (input.email !== undefined) pending.email = input.email;
            if (input.departmentId !== undefined) pending.departmentId = input.departmentId;
            pending.lastSeenAt = now;
        } else {
            pending = repo.create({
                erpId: input.erpId,
                fullName: input.fullName ?? null,
                email: input.email ?? null,
                departmentId: input.departmentId ?? null,
                firstSeenAt: now,
                lastSeenAt: now,
            });
        }
        return repo.save(pending);
    }

    // Called the moment an erpId gets linked to an Administrator, by either path (auto
    // email-match or manual creation) — a no-op when no pending row exists.
    async deleteByErpId(ctx: RequestContext, erpId: string): Promise<void> {
        await this.connection.getRepository(ctx, PendingErpUser).delete({ erpId });
    }

    // Real server-side pagination (AGENTS.md's pagination rule) — this list accumulates over
    // every 1C "user" ever seen that hasn't yet been linked to an Administrator, it is not
    // genuinely bounded. Backs the Dashboard "ERP users" > Pending screen's ListPage.
    async findAllPaginated(
        ctx: RequestContext,
        options?: ListQueryOptions<PendingErpUser>,
    ): Promise<PaginatedList<PendingErpUser>> {
        const [items, totalItems] = await this.listQueryBuilder
            .build(PendingErpUser, options, { ctx, orderBy: { firstSeenAt: 'ASC' } })
            .getManyAndCount();
        return { items, totalItems };
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<PendingErpUser | null> {
        return this.connection.getRepository(ctx, PendingErpUser).findOne({ where: { erpId } });
    }
}

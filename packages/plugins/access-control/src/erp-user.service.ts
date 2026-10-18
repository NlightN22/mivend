import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In, IsNull, Not } from 'typeorm';

import { ErpUser } from './entities/erp-user.entity';

export interface ErpUserUpsertInput {
    erpId: string;
    fullName?: string | null;
    email?: string | null;
    departmentId?: string | null;
    positionErpId?: string | null;
    // undefined = "this event didn't carry the field, leave `active` unchanged" — same
    // undefined-vs-null convention as UserEnrichmentInput's own email/departmentId.
    active?: boolean;
}

// Issue #119: the ERP-user mirror table — see ErpUser's own doc comment for the full rationale.
@Injectable()
export class ErpUserService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // Idempotent. Also runs after linking: post-link updates still matter (see findAllPaginated).
    async upsert(ctx: RequestContext, input: ErpUserUpsertInput): Promise<ErpUser> {
        const repo = this.connection.getRepository(ctx, ErpUser);
        const now = new Date();
        let user = await repo.findOne({ where: { erpId: input.erpId } });
        if (user) {
            if (input.fullName !== undefined) user.fullName = input.fullName;
            if (input.email !== undefined) user.email = input.email;
            if (input.departmentId !== undefined) user.departmentId = input.departmentId;
            if (input.positionErpId !== undefined) user.positionErpId = input.positionErpId;
            if (input.active !== undefined) user.active = input.active;
            user.lastSeenAt = now;
        } else {
            user = repo.create({
                erpId: input.erpId,
                fullName: input.fullName ?? null,
                email: input.email ?? null,
                departmentId: input.departmentId ?? null,
                positionErpId: input.positionErpId ?? null,
                active: input.active ?? null,
                status: 'unlinked',
                administratorId: null,
                firstSeenAt: now,
                lastSeenAt: now,
            });
        }
        return repo.save(user);
    }

    // Keep the row on link: counterparty.handler.ts distinguishes unseen erpId (retry) from unlinked
    // and linked erpIds, so upsert first: email-match can link an erpId never seen as a candidate.
    async markLinked(ctx: RequestContext, erpId: string, administratorId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, ErpUser);
        const now = new Date();
        const existing = await repo.findOne({ where: { erpId } });
        if (existing) {
            existing.status = 'linked';
            existing.administratorId = administratorId;
            existing.lastSeenAt = now;
            await repo.save(existing);
            return;
        }
        await repo.save(
            repo.create({
                erpId,
                fullName: null,
                email: null,
                departmentId: null,
                positionErpId: null,
                active: null,
                status: 'linked',
                administratorId,
                firstSeenAt: now,
                lastSeenAt: now,
            }),
        );
    }

    // Filter out linked rows: they are never deleted, so they would reappear here forever.
    // Also exclude known-inactive ERP users; they can never become Administrators (see ErpUser.active).
    async findAllPaginated(
        ctx: RequestContext,
        options?: ListQueryOptions<ErpUser>,
    ): Promise<PaginatedList<ErpUser>> {
        const qb = this.listQueryBuilder.build(ErpUser, options, {
            ctx,
            orderBy: { firstSeenAt: 'ASC' },
        });
        qb.andWhere(`${qb.alias}.status = :status`, { status: 'unlinked' }).andWhere(
            `(${qb.alias}.active IS NULL OR ${qb.alias}.active = true)`,
        );
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    async findPositionErpIds(ctx: RequestContext, erpIds: string[]): Promise<Map<string, string>> {
        if (erpIds.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, ErpUser)
            .find({ where: { erpId: In(erpIds), positionErpId: Not(IsNull()) } });
        return new Map(rows.map(u => [u.erpId, u.positionErpId as string]));
    }

    async setPositionIfExists(
        ctx: RequestContext,
        erpId: string,
        positionErpId: string | null,
    ): Promise<void> {
        await this.connection.getRepository(ctx, ErpUser).update({ erpId }, { positionErpId });
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<ErpUser | null> {
        return this.connection.getRepository(ctx, ErpUser).findOne({ where: { erpId } });
    }
}

import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { ErpUser } from './entities/erp-user.entity';

export interface ErpUserUpsertInput {
    erpId: string;
    fullName?: string | null;
    email?: string | null;
    departmentId?: string | null;
    // undefined = "this event didn't carry the field, leave `active` unchanged" — same
    // undefined-vs-null convention as UserEnrichmentInput's own email/departmentId.
    active?: boolean;
}

// Issue #119: the 1C-user mirror table — see ErpUser's own doc comment for the full rationale.
@Injectable()
export class ErpUserService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // Called on every UserChanged event — idempotent, keeps the row's fields/lastSeenAt current
    // for whoever reviews the Pending list, and after linking too (see this method's own note in
    // findAllPaginated on why post-link updates still matter).
    async upsert(ctx: RequestContext, input: ErpUserUpsertInput): Promise<ErpUser> {
        const repo = this.connection.getRepository(ctx, ErpUser);
        const now = new Date();
        let user = await repo.findOne({ where: { erpId: input.erpId } });
        if (user) {
            if (input.fullName !== undefined) user.fullName = input.fullName;
            if (input.email !== undefined) user.email = input.email;
            if (input.departmentId !== undefined) user.departmentId = input.departmentId;
            if (input.active !== undefined) user.active = input.active;
            user.lastSeenAt = now;
        } else {
            user = repo.create({
                erpId: input.erpId,
                fullName: input.fullName ?? null,
                email: input.email ?? null,
                departmentId: input.departmentId ?? null,
                active: input.active ?? null,
                status: 'unlinked',
                administratorId: null,
                firstSeenAt: now,
                lastSeenAt: now,
            });
        }
        return repo.save(user);
    }

    // Issue #119 / mivend.audit.common (2026-09-20): the moment an erpId gets linked to an
    // Administrator, by either path (auto email-match or manual creation) — flips this row to
    // `linked` in place instead of deleting it, upserting one first if none exists yet (the
    // immediate-email-match path can link an erpId that was never `upsert()`-ed as a candidate
    // first). The row must survive: it is the single source `counterparty.handler.ts` (and any
    // future manager-erpId-dependent handler) consults to tell "never seen this erpId, real
    // race, retry" apart from "know about it, unlinked, will not retry" apart from "linked, here
    // is the Administrator" — deleting it on link collapsed the second and third cases back into
    // the first indistinguishably.
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
                active: null,
                status: 'linked',
                administratorId,
                firstSeenAt: now,
                lastSeenAt: now,
            }),
        );
    }

    // Real server-side pagination (AGENTS.md's pagination rule) — this list accumulates over
    // every 1C "user" ever seen. Backs the Dashboard "ERP users" > Pending screen and the
    // manager-portal Settings > Users > Pending tab's ListPage/table — both must only ever see
    // rows still worth a human's decision: `status: 'unlinked'` (a `linked` row has already been
    // decided, and would otherwise reappear here forever now that rows are never deleted) AND
    // not known-inactive (a 1C user already reported inactive/deleted will never sensibly become
    // an Administrator — same UX guard issue #119's own follow-up fix established before this
    // table stopped deleting rows on link, see `active`'s own doc comment on ErpUser).
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

    async findByErpId(ctx: RequestContext, erpId: string): Promise<ErpUser | null> {
        return this.connection.getRepository(ctx, ErpUser).findOne({ where: { erpId } });
    }
}

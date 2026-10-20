import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    AdministratorService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Brackets, In, SelectQueryBuilder } from 'typeorm';
import {
    CustomPermission,
    TeamAdministratorService,
    VisibilityGrant,
    VisibilityGrantReader,
} from '@mivend/plugin-access-control';

export type VisibilityGrantStatus = 'active' | 'scheduled' | 'expired' | 'revoked';

export interface VisibilityGrantRow {
    id: string;
    uuid: string;
    granteeAdministratorId: string;
    granteeName: string;
    managerAdministratorId: string;
    managerName: string;
    subjectKind: string;
    validFrom: Date | null;
    validTo: Date | null;
    reason: string;
    grantedByAdministratorId: string | null;
    grantedByName: string | null;
    revokedAt: Date | null;
    revokedByAdministratorId: string | null;
    createdAt: Date;
    status: VisibilityGrantStatus;
}

export interface VisibilityGrantListArgs {
    granteeAdministratorId?: string;
    status?: VisibilityGrantStatus;
    // Matches the grantee or the manager by name or email.
    search?: string;
    take?: number;
    skip?: number;
}

const MAX_TAKE = 100;
const CANDIDATE_LIMIT = 500;
const ADMIN_MATCH = `(a."firstName" || ' ' || a."lastName") ILIKE :term OR a."emailAddress" ILIKE :term`;

export function grantStatus(row: VisibilityGrant, now: Date): VisibilityGrantStatus {
    if (row.revokedAt) return 'revoked';
    if (row.validFrom && row.validFrom > now) return 'scheduled';
    if (row.validTo && row.validTo <= now) return 'expired';
    return 'active';
}

function applyStatus(
    qb: SelectQueryBuilder<VisibilityGrant>,
    status: VisibilityGrantStatus,
    now: Date,
): void {
    if (status === 'revoked') {
        qb.andWhere('g.revokedAt IS NOT NULL');
        return;
    }
    qb.andWhere('g.revokedAt IS NULL');
    if (status === 'scheduled') qb.andWhere('g.validFrom > :now', { now });
    if (status === 'expired') qb.andWhere('g.validTo <= :now', { now });
    if (status === 'active') {
        qb.andWhere(
            new Brackets(b =>
                b.where('g.validFrom IS NULL').orWhere('g.validFrom <= :now', { now }),
            ),
        ).andWhere(
            new Brackets(b => b.where('g.validTo IS NULL').orWhere('g.validTo > :now', { now })),
        );
    }
}

// A caller without ManageAccessControl sees grants they made or whose grantee is in their team.
@Injectable()
export class VisibilityGrantQueryService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private teamService: TeamAdministratorService,
        private reader: VisibilityGrantReader,
    ) {}

    async findPage(
        ctx: RequestContext,
        args: VisibilityGrantListArgs,
    ): Promise<{ items: VisibilityGrantRow[]; totalItems: number }> {
        const now = new Date();
        const qb = this.connection.getRepository(ctx, VisibilityGrant).createQueryBuilder('g');
        if (args.granteeAdministratorId) {
            qb.andWhere('g.granteeAdministratorId = :grantee', {
                grantee: String(args.granteeAdministratorId),
            });
        }
        if (args.search?.trim()) {
            qb.andWhere(
                `(g.granteeAdministratorId IN (SELECT a.id::text FROM administrator a WHERE ${ADMIN_MATCH})
                  OR g.subjectRef IN (SELECT a.id::text FROM administrator a WHERE ${ADMIN_MATCH}))`,
                { term: `%${args.search.trim()}%` },
            );
        }
        if (args.status) applyStatus(qb, args.status, now);
        if (!ctx.userHasPermissions([CustomPermission.ManageAccessControl.Permission])) {
            await this.restrictToCaller(ctx, qb);
        }
        const [rows, totalItems] = await qb
            .orderBy('g.createdAt', 'DESC')
            .addOrderBy('g.id', 'DESC')
            .take(Math.min(args.take ?? 25, MAX_TAKE))
            .skip(args.skip ?? 0)
            .getManyAndCount();
        return { totalItems, items: await this.toRows(ctx, rows) };
    }

    private async toRows(
        ctx: RequestContext,
        rows: VisibilityGrant[],
    ): Promise<VisibilityGrantRow[]> {
        const now = new Date();
        const names = await this.names(ctx, rows);
        return rows.map(row => ({
            id: String(row.id),
            uuid: row.uuid,
            granteeAdministratorId: row.granteeAdministratorId,
            granteeName: names.get(row.granteeAdministratorId) ?? row.granteeAdministratorId,
            managerAdministratorId: row.subjectRef,
            managerName: names.get(row.subjectRef) ?? row.subjectRef,
            subjectKind: row.subjectKind,
            validFrom: row.validFrom,
            validTo: row.validTo,
            reason: row.reason,
            grantedByAdministratorId: row.grantedByAdministratorId,
            grantedByName: row.grantedByAdministratorId
                ? (names.get(row.grantedByAdministratorId) ?? null)
                : null,
            revokedAt: row.revokedAt,
            revokedByAdministratorId: row.revokedByAdministratorId,
            createdAt: row.createdAt,
            status: grantStatus(row, now),
        }));
    }

    // Same rule as the writer: everyone for ManageAccessControl, else the caller's team and own granted managers.
    async findCandidates(ctx: RequestContext): Promise<Administrator[]> {
        const repo = this.connection.getRepository(ctx, Administrator);
        if (ctx.userHasPermissions([CustomPermission.ManageAccessControl.Permission])) {
            return repo.find({ order: { id: 'ASC' }, take: CANDIDATE_LIMIT });
        }
        const actor = ctx.activeUserId
            ? await this.administratorService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        const team = await this.teamService.findTeam(ctx);
        const granted = actor ? await this.reader.activeManagerIds(ctx, String(actor.id)) : [];
        const known = new Set(team.map(a => String(a.id)));
        const extra = granted.filter(id => !known.has(id));
        const grantedAdmins = extra.length ? await repo.find({ where: { id: In(extra) } }) : [];
        return [...team, ...grantedAdmins];
    }

    // Read back after a write by the writer itself, so no caller restriction applies.
    async findOne(ctx: RequestContext, id: ID): Promise<VisibilityGrantRow> {
        const row = await this.connection
            .getRepository(ctx, VisibilityGrant)
            .findOneOrFail({ where: { id } });
        return (await this.toRows(ctx, [row]))[0];
    }

    private async restrictToCaller(
        ctx: RequestContext,
        qb: SelectQueryBuilder<VisibilityGrant>,
    ): Promise<void> {
        const actor = ctx.activeUserId
            ? await this.administratorService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        const team = (await this.teamService.findTeam(ctx)).map(a => String(a.id));
        qb.andWhere(
            new Brackets(b => {
                b.where('g.grantedByAdministratorId = :actor', {
                    actor: actor ? String(actor.id) : null,
                });
                if (team.length > 0) b.orWhere('g.granteeAdministratorId IN (:...team)', { team });
            }),
        );
    }

    private async names(
        ctx: RequestContext,
        rows: VisibilityGrant[],
    ): Promise<Map<string, string>> {
        const ids = new Set<string>();
        for (const row of rows) {
            ids.add(row.granteeAdministratorId);
            ids.add(row.subjectRef);
            if (row.grantedByAdministratorId) ids.add(row.grantedByAdministratorId);
        }
        if (ids.size === 0) return new Map();
        const admins = await this.connection
            .getRepository(ctx, Administrator)
            .find({ where: { id: In([...ids]) }, withDeleted: true });
        return new Map(admins.map(a => [String(a.id), `${a.firstName} ${a.lastName}`.trim()]));
    }
}

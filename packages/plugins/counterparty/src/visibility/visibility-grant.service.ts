import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    AdministratorService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { IsNull } from 'typeorm';
import { withAggregateLock } from 'shared';
import {
    BranchAssignmentService,
    CustomPermission,
    TeamAdministratorService,
    VisibilityGrant,
    VisibilityGrantReader,
} from '@mivend/plugin-access-control';
import { VersioningService } from '@mivend/plugin-versioning';

export interface GrantVisibilityInput {
    granteeAdministratorId: ID;
    managerAdministratorId: ID;
    validFrom?: Date | null;
    validTo?: Date | null;
    reason: string;
}

// Write side of the visibility grants (#123): every grant and revoke is audited with its actor.
@Injectable()
export class VisibilityGrantService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private teamService: TeamAdministratorService,
        private reader: VisibilityGrantReader,
        private versioning: VersioningService,
        private branchAssignment: BranchAssignmentService,
    ) {}

    async grant(ctx: RequestContext, input: GrantVisibilityInput): Promise<VisibilityGrant> {
        this.assertCentral();
        const grantee = String(input.granteeAdministratorId);
        const manager = String(input.managerAdministratorId);
        const reason = input.reason.trim();
        const validFrom = input.validFrom ?? null;
        const validTo = input.validTo ?? null;
        if (!reason) throw new UserInputError('A reason is required');
        if (grantee === manager) throw new UserInputError('A grant to the manager itself is empty');
        if (validTo && validFrom && validTo <= validFrom) {
            throw new UserInputError('The end of the period must be after its start');
        }
        if (validTo && validTo <= new Date()) {
            throw new UserInputError('The end of the period is already in the past');
        }
        const actor = await this.actorId(ctx);
        const unrestricted = this.isUnrestricted(ctx);
        return withAggregateLock(this.connection, ctx, `visibility-grant:${grantee}`, async tx => {
            await this.assertMayGrant(tx, unrestricted, actor, grantee, manager);
            await this.assertLiveAdministrators(tx, [grantee, manager]);
            await this.assertNoOverlap(tx, grantee, manager, validFrom, validTo);
            const repo = this.connection.getRepository(tx, VisibilityGrant);
            const row = await repo.save(
                repo.create({
                    granteeAdministratorId: grantee,
                    subjectKind: 'manager',
                    subjectRef: manager,
                    validFrom,
                    validTo,
                    reason,
                    grantedByAdministratorId: actor,
                }),
            );
            await this.versioning.recordChange(tx, {
                entityName: 'VisibilityGrant',
                entityId: row.id,
                action: 'create',
                comment: reason,
                changedFields: {
                    granteeAdministratorId: { from: null, to: grantee },
                    managerAdministratorId: { from: null, to: manager },
                    validFrom: { from: null, to: validFrom },
                    validTo: { from: null, to: validTo },
                },
            });
            return row;
        });
    }

    // The row is locked first, so two concurrent revokes record exactly one audit entry.
    async revoke(
        ctx: RequestContext,
        grantId: ID,
        reason?: string | null,
    ): Promise<VisibilityGrant> {
        this.assertCentral();
        const actor = await this.actorId(ctx);
        const unrestricted = this.isUnrestricted(ctx);
        return this.connection.withTransaction(ctx, async tx => {
            const repo = this.connection.getRepository(tx, VisibilityGrant);
            const row = await repo.findOne({
                where: { id: grantId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!row) throw new UserInputError(`Visibility grant not found: id=${grantId}`);
            if (row.revokedAt) return row;
            if (row.grantedByAdministratorId !== actor) {
                await this.assertMayGrant(tx, unrestricted, actor, null, row.subjectRef);
            }
            row.revokedAt = new Date();
            row.revokedByAdministratorId = actor;
            await repo.update(row.id, {
                revokedAt: row.revokedAt,
                revokedByAdministratorId: actor,
            });
            await this.versioning.recordChange(tx, {
                entityName: 'VisibilityGrant',
                entityId: row.id,
                action: 'deactivate',
                comment: reason?.trim() || undefined,
                changedFields: { revokedAt: { from: null, to: row.revokedAt } },
            });
            return row;
        });
    }

    // ManageAccessControl is unrestricted; otherwise grantee and manager must be visible to the
    // caller (their branch team or their own granted managers) and the caller cannot grant to self.
    private isUnrestricted(ctx: RequestContext): boolean {
        return ctx.userHasPermissions([CustomPermission.ManageAccessControl.Permission]);
    }

    private async assertMayGrant(
        ctx: RequestContext,
        unrestricted: boolean,
        actor: string | null,
        grantee: string | null,
        manager: string,
    ): Promise<void> {
        if (unrestricted) return;
        if (actor == null || grantee === actor) throw new ForbiddenError();
        const team = new Set((await this.teamService.findTeam(ctx)).map(a => String(a.id)));
        for (const id of await this.reader.activeManagerIds(ctx, actor)) team.add(id);
        if (!team.has(manager) || (grantee != null && !team.has(grantee))) {
            throw new ForbiddenError();
        }
    }

    private async assertLiveAdministrators(ctx: RequestContext, ids: string[]): Promise<void> {
        const live = await this.connection
            .getRepository(ctx, Administrator)
            .find({ where: ids.map(id => ({ id, deletedAt: IsNull() })), select: ['id'] });
        if (live.length !== ids.length) throw new UserInputError('Administrator not found');
    }

    private async assertNoOverlap(
        ctx: RequestContext,
        grantee: string,
        manager: string,
        validFrom: Date | null,
        validTo: Date | null,
    ): Promise<void> {
        const clash = await this.connection
            .getRepository(ctx, VisibilityGrant)
            .createQueryBuilder('g')
            .where('g.granteeAdministratorId = :grantee', { grantee })
            .andWhere("g.subjectKind = 'manager' AND g.subjectRef = :manager", { manager })
            .andWhere('g.revokedAt IS NULL')
            .andWhere('(g.validTo IS NULL OR g.validTo > :now)', { now: new Date() })
            .andWhere(
                `COALESCE(g.validFrom, '-infinity'::timestamp) < COALESCE(CAST(:to AS timestamp), 'infinity'::timestamp)`,
                { to: validTo },
            )
            .andWhere(
                `COALESCE(CAST(:from AS timestamp), '-infinity'::timestamp) < COALESCE(g.validTo, 'infinity'::timestamp)`,
                { from: validFrom },
            )
            .getCount();
        if (clash > 0) {
            throw new UserInputError('An overlapping grant of this manager already exists');
        }
    }

    private async actorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }

    private assertCentral(): void {
        if (this.branchAssignment.isReplica) {
            throw new UserInputError(
                'Visibility grants are maintained on the central instance only',
            );
        }
    }
}

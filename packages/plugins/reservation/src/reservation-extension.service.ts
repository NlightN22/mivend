import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AdministratorService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { Reservation } from './entities/reservation.entity';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';

// Split out of ReservationService to keep that file under AGENTS.md's ~300-line guideline —
// "extend an active reservation's expiry" is a self-contained concern.
@Injectable()
export class ReservationExtensionService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private extensionLimitService: ReservationExtensionLimitService,
    ) {}

    // "managers can extend up to a configured maximum without additional approval" (see
    // docs/architecture.md) — the caller's role must have a ReservationExtensionLimit row, and
    // additionalDays must not exceed it. No row configured means no self-service extension is
    // allowed for that role (safe default, mirrors CreditTermLimitService's absence-is-strict
    // convention).
    async extendReservation(
        ctx: RequestContext,
        orderId: ID,
        additionalDays: number,
    ): Promise<Reservation[]> {
        if (!Number.isInteger(additionalDays) || additionalDays <= 0) {
            throw new UserInputError('additionalDays must be a positive integer');
        }

        const roleCode = await this.getCallerRoleCode(ctx);
        const limit = roleCode ? await this.extensionLimitService.getLimit(ctx, roleCode) : null;
        if (!limit || additionalDays > limit.maxExtraDays) {
            throw new ForbiddenError();
        }

        const repo = this.connection.getRepository(ctx, Reservation);
        const active = await repo.find({ where: { orderId: String(orderId), status: 'active' } });
        if (!active.length) {
            throw new UserInputError('This order has no active reservation to extend');
        }

        for (const row of active) {
            row.expiresAt = new Date(
                row.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000,
            );
        }
        return repo.save(active);
    }

    private async getCallerRoleCode(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId, [
            'user.roles',
        ]);
        return admin?.user?.roles?.[0]?.code ?? null;
    }
}

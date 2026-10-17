import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { AccessScopeService } from '@mivend/plugin-access-control';
import { ChecksService, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { ManagerActionSubject } from '@mivend/plugin-checks';
import { withAggregateLock } from 'shared';

import { Reservation } from './entities/reservation.entity';
import type { ReservationExtensionParams } from './reservation-extension.check';

// Split out of ReservationService to keep that file under AGENTS.md's ~300-line guideline —
// "extend an active reservation's expiry" is a self-contained concern.
@Injectable()
export class ReservationExtensionService {
    constructor(
        private connection: TransactionalConnection,
        private accessScope: AccessScopeService,
        private checks: ChecksService,
    ) {}

    // The limit is the `manager.reservation-extension-days` check; its policy decides the consequence.
    async extendReservation(
        ctx: RequestContext,
        orderId: ID,
        additionalDays: number,
    ): Promise<Reservation[]> {
        if (!Number.isInteger(additionalDays) || additionalDays <= 0) {
            throw new UserInputError('additionalDays must be a positive integer');
        }

        const actor = await this.accessScope.getActorIdentity(ctx);
        const subject: ManagerActionSubject<ReservationExtensionParams> = {
            ...actor,
            params: { additionalDays },
        };
        const { strongestConsequence } = await this.checks.evaluate(
            ctx,
            MANAGER_SUBJECT_TYPE,
            subject,
            MANAGER_STAGES.extendReservation,
        );
        if (strongestConsequence === 'block') {
            throw new ForbiddenError();
        }

        return withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, async txCtx => {
            // One conditional UPDATE: a row an expiry sweep holds or released meanwhile is not extended.
            const result = await this.connection
                .getRepository(txCtx, Reservation)
                .createQueryBuilder()
                .update()
                .set({ expiresAt: () => `"expiresAt" + make_interval(days => :days)` })
                .setParameter('days', additionalDays)
                .where('orderId = :orderId AND status = :status', {
                    orderId: String(orderId),
                    status: 'active',
                })
                .returning('*')
                .execute();
            const extended = (result.raw as Array<Partial<Reservation>>).map(row =>
                Object.assign(new Reservation(), row),
            );
            if (!extended.length) {
                throw new UserInputError('This order has no active reservation to extend');
            }
            return extended;
        });
    }
}

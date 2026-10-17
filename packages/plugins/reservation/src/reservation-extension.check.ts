import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { CheckContext, Finding, ManagerActionSubject } from '@mivend/plugin-checks';

import { ReservationExtensionLimitService } from './reservation-extension-limit.service';

export const RESERVATION_EXTENSION_CHECK_CODE = 'manager.reservation-extension-days';

export interface ReservationExtensionParams {
    additionalDays: number;
}

// The most permissive limit among the actor's roles applies; none has a row: fail closed, the default policy blocks.
@Injectable()
export class ReservationExtensionCheck implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private limits: ReservationExtensionLimitService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<ManagerActionSubject<ReservationExtensionParams>>({
            code: RESERVATION_EXTENSION_CHECK_CODE,
            subjectType: MANAGER_SUBJECT_TYPE,
            stages: [MANAGER_STAGES.extendReservation],
            description: "Reservation extension exceeds the role's allowed extra days",
            defaultConsequence: 'block',
            evaluate: (subject, context) => this.evaluate(subject, context),
        });
    }

    async evaluate(
        subject: ManagerActionSubject<ReservationExtensionParams>,
        { ctx }: CheckContext,
    ): Promise<Finding[]> {
        const requestedDays = subject.params.additionalDays;
        if (!Number.isFinite(requestedDays)) return [];
        const limit = await this.limits.getMaxLimit(ctx, subject.roleCodes);
        if (!limit) {
            return [
                {
                    severity: 'error',
                    facts: { requestedDays },
                    messageKey: 'manager.reservation-extension-days.no-limit',
                },
            ];
        }
        if (requestedDays <= limit.maxExtraDays) return [];
        return [
            {
                severity: 'error',
                facts: { requestedDays, limitDays: limit.maxExtraDays },
                messageKey: 'manager.reservation-extension-days.over-limit',
            },
        ];
    }
}

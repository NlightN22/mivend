import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry } from '@mivend/plugin-checks';

import { PLACEMENT_CASES, PLACEMENT_CHECK_STAGE, type PlacementCaseKey } from './placement-cases';
import { evaluatePlacementCase } from './placement-confirmation.check';

// Rule text: docs/payments.md "Confirmation matrix" (#349). Evaluated only by the placement decision.
@Injectable()
export class PlacementConfirmationCheckRegistrar implements OnModuleInit {
    constructor(private registry: CheckRegistry) {}

    onModuleInit(): void {
        for (const placementCase of PLACEMENT_CASES) {
            this.registry.registerCheck<unknown>({
                code: placementCase.code,
                subjectType: 'order',
                stages: [PLACEMENT_CHECK_STAGE],
                description: placementCase.description,
                defaultConsequence: 'warn',
                evaluate: (_subject, { input }) =>
                    evaluatePlacementCase(placementCase, input as PlacementCaseKey | undefined),
            });
        }
    }
}

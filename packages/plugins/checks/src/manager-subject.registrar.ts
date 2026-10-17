import { Injectable, OnModuleInit } from '@nestjs/common';

import { CheckRegistry } from './check-registry';
import { MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from './manager-subject';
import type { ManagerActionSubject } from './manager-subject';

// Shared by plugins that do not depend on each other, so the framework registers it once.
// `require-approval` only where the stage has an approval executor.
@Injectable()
export class ManagerSubjectRegistrar implements OnModuleInit {
    constructor(private registry: CheckRegistry) {}

    onModuleInit(): void {
        this.registry.registerSubjectType<ManagerActionSubject>({
            type: MANAGER_SUBJECT_TYPE,
            ephemeral: true,
            stages: Object.values(MANAGER_STAGES),
            allowedConsequences: ['info', 'warn', 'block'],
            stageConsequences: {
                [MANAGER_STAGES.extendCreditTerm]: ['require-approval'],
                [MANAGER_STAGES.adjustPrice]: ['require-approval'],
            },
            branchId: subject => subject.branchId,
        });
    }
}

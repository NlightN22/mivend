import { RequestContextService, ScheduledTask } from '@vendure/core';

import { ContractProformaCleanupService } from './contract-proforma-cleanup.service';

// 03:30 on January 1st and July 1st.
const TWICE_A_YEAR = '30 3 1 1,7 *';

export function createContractProformaCleanupTask(retentionMonths: number): ScheduledTask {
    return new ScheduledTask({
        id: 'contract-proforma-cleanup',
        description: 'Deletes contract payment proformas and their PDFs past the retention period.',
        schedule: TWICE_A_YEAR,
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const deleted = await injector
                .get(ContractProformaCleanupService)
                .run(ctx, retentionMonths);
            return { deleted };
        },
    });
}

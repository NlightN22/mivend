import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry } from '@mivend/plugin-checks';

import type { OrderCheckSubject } from './order-check-subject';
import { ORDER_SUBJECT_TYPE } from './order-check-subject';
import { ERP_EXPORT_DATA_MISSING, evaluateExportDataMissing } from './order-export-data.check';

// Describes the data gaps the reserve refuses on (`findErpExportGaps`, a transactional hard gate that stays).
@Injectable()
export class OrderExportDataRegistrar implements OnModuleInit {
    constructor(private registry: CheckRegistry) {}

    onModuleInit(): void {
        this.registry.registerCheck<OrderCheckSubject>({
            code: ERP_EXPORT_DATA_MISSING,
            subjectType: ORDER_SUBJECT_TYPE,
            stages: ['checkout', 'pre-reserve', 'on-edit'],
            description:
                'The ERP order needs the buyer, every product and the warehouse to have an ERP id.',
            stageDefaults: { checkout: 'warn', 'pre-reserve': 'hold', 'on-edit': 'warn' },
            evaluate: subject => evaluateExportDataMissing(subject),
        });
    }
}

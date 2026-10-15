import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry } from '@mivend/plugin-checks';
import { ORDER_SUBJECT_TYPE } from '@mivend/plugin-reservation';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';

import {
    CONTRACT_WITH_STORAGE_ORGANIZATION,
    evaluateContractWithStorageOrganization,
} from './contract-with-storage-organization.check';
import { OrderCheckDataService } from './order-check-data.service';
import { ORGANIZATION_STOCK, evaluateOrganizationStock } from './organization-stock.check';

const STAGES = ['checkout', 'pre-reserve', 'pre-send-to-erp', 'on-edit'];

// Rule text: docs/order-contracts.md "ERP-mandated order controls (#237)". Default consequence is `warn`.
@Injectable()
export class OrderCheckProvidersRegistrar implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private data: OrderCheckDataService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<OrderCheckSubject>({
            code: CONTRACT_WITH_STORAGE_ORGANIZATION,
            subjectType: ORDER_SUBJECT_TYPE,
            stages: STAGES,
            description:
                'ERP requirement: the buyer needs an active customer contract with an organization that holds the product storage place at the order warehouse.',
            evaluate: async (subject, { ctx }) =>
                evaluateContractWithStorageOrganization(
                    subject,
                    await this.data.load(ctx, subject, { withStock: false }),
                ),
        });
        this.registry.registerCheck<OrderCheckSubject>({
            code: ORGANIZATION_STOCK,
            subjectType: ORDER_SUBJECT_TYPE,
            stages: STAGES,
            description:
                'ERP requirement: organizations holding the storage place and having a customer contract with the buyer must hold the ordered quantity.',
            evaluate: async (subject, { ctx }) =>
                evaluateOrganizationStock(
                    subject,
                    await this.data.load(ctx, subject, { withStock: true }),
                ),
        });
    }
}

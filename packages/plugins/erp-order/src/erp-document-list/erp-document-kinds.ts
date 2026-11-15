import type { EntitySchema, ObjectLiteral, ObjectType } from 'typeorm';

import { CustomerClaimErp } from '../erp-documents/customer-claim-erp.entity';
import { OrderCorrectionErp } from '../erp-documents/order-correction-erp.entity';
import { SalesCorrectionErp } from '../erp-documents/sales-correction-erp.entity';
export type ErpDocumentKind = 'customerClaim' | 'salesCorrection' | 'orderCorrection';

export interface ErpDocumentKindConfig {
    entity: string | ObjectType<ObjectLiteral> | EntitySchema<ObjectLiteral>;
    lineTables: readonly string[];
    // Order corrections carry neither a contract nor a currency.
    hasContract: boolean;
    hasCurrency: boolean;
}

export const ERP_DOCUMENT_KINDS: Record<ErpDocumentKind, ErpDocumentKindConfig> = {
    customerClaim: {
        entity: CustomerClaimErp,
        lineTables: ['customer_claim_goods_line_erp', 'customer_claim_service_line_erp'],
        hasContract: true,
        hasCurrency: true,
    },
    salesCorrection: {
        entity: SalesCorrectionErp,
        lineTables: ['sales_correction_goods_line_erp', 'sales_correction_service_line_erp'],
        hasContract: true,
        hasCurrency: true,
    },
    orderCorrection: {
        entity: OrderCorrectionErp,
        lineTables: [
            'order_correction_goods_line_erp',
            'order_correction_service_line_erp',
            'order_correction_container_line_erp',
        ],
        hasContract: false,
        hasCurrency: false,
    },
};

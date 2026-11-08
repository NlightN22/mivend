import { CustomerClaimErp } from './customer-claim-erp.entity';
import {
    CustomerClaimGoodsLineErp,
    CustomerClaimServiceLineErp,
} from './customer-claim-line-erp.entity';
import { OrderChangeResultErp } from './order-change-result-erp.entity';
import { OrderCorrectionErp } from './order-correction-erp.entity';
import {
    OrderCorrectionContainerLineErp,
    OrderCorrectionGoodsLineErp,
    OrderCorrectionServiceLineErp,
} from './order-correction-line-erp.entity';
import { SalesCorrectionErp } from './sales-correction-erp.entity';
import {
    SalesCorrectionGoodsLineErp,
    SalesCorrectionServiceLineErp,
} from './sales-correction-line-erp.entity';

export const ERP_DOCUMENT_ENTITIES = [
    CustomerClaimErp,
    CustomerClaimGoodsLineErp,
    CustomerClaimServiceLineErp,
    SalesCorrectionErp,
    SalesCorrectionGoodsLineErp,
    SalesCorrectionServiceLineErp,
    OrderCorrectionErp,
    OrderCorrectionGoodsLineErp,
    OrderCorrectionServiceLineErp,
    OrderCorrectionContainerLineErp,
    OrderChangeResultErp,
];

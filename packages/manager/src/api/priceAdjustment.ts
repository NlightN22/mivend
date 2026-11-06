import { adminApi } from './client';
import { RequestPriceAdjustmentDocument } from './generated/graphql';

export interface PriceAdjustmentResult {
    decision: 'apply-directly' | 'requires-approval';
    approvalRequestId: string | null;
}

export async function requestPriceAdjustment(
    orderId: string,
    orderLineId: string,
    requestedPrice: number,
    justification?: string,
): Promise<PriceAdjustmentResult> {
    const result = await adminApi(RequestPriceAdjustmentDocument, {
        orderId,
        orderLineId,
        requestedPrice,
        justification,
    });
    return result.requestPriceAdjustment as PriceAdjustmentResult;
}

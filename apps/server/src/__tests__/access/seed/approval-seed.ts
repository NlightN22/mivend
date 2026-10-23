import { gqlOk, login } from '../harness/graphql';
import {
    APPROVAL_REQUESTERS,
    STAFF_PASSWORD,
    counterpartyErpId,
    staffEmail,
    type ApprovalKey,
} from './fixture-plan';
import type { OrderSeedIds } from './orders-seed';

export interface ApprovalSeedIds {
    adjustments: Record<ApprovalKey, string>;
    creditTerms: Record<ApprovalKey, string>;
    probe: string;
}

// One department-head step for every type, so a branch head is the natural decider (same as seed-approvals.mjs).
const WORKFLOWS = ['priceAdjustmentApproval', 'creditTermApproval', 'creditTermApprovalEscalated'];

const ADJUST = `mutation($o: ID!, $l: ID!) { requestPriceAdjustment(orderId: $o, orderLineId: $l,
    requestedPrice: 1, justification: "access scope probe") { decision approvalRequestId } }`;
const CREDIT = `mutation($e: String!) { requestCreditTermExtension(input: { counterpartyErpId: $e,
    requestedExtraDays: 5, justification: "access scope probe" }) { id } }`;

export async function seedApprovals(
    baseUrl: string,
    superadmin: string,
    ordering: OrderSeedIds,
): Promise<ApprovalSeedIds> {
    for (const type of WORKFLOWS)
        await gqlOk(
            baseUrl,
            'admin-api',
            `mutation($t: String!) { upsertWorkflowDefinition(requestType: $t, displayName: $t,
                steps: [{ order: 0, role: "department-head", requiredPermission: "ApproveDiscountRequest",
                escalatesTo: [] }]) { requestType } }`,
            { t: type },
            superadmin,
        );
    const lineOf = async (orderId: string): Promise<string> => {
        const r = await gqlOk<{ order: { lines: { id: string }[] } }>(
            baseUrl,
            'admin-api',
            `query($id: ID!) { order(id: $id) { lines { id } } }`,
            { id: orderId },
            superadmin,
        );
        return r.order.lines[0].id;
    };
    const out = { adjustments: {}, creditTerms: {} } as ApprovalSeedIds;
    const adjust = async (token: string, orderId: string): Promise<string> => {
        const r = await gqlOk<{
            requestPriceAdjustment: { decision: string; approvalRequestId: string | null };
        }>(baseUrl, 'admin-api', ADJUST, { o: orderId, l: await lineOf(orderId) }, token);
        if (!r.requestPriceAdjustment.approvalRequestId)
            throw new Error(`Price adjustment on ${orderId} applied directly, no request`);
        return r.requestPriceAdjustment.approvalRequestId;
    };
    for (const key of Object.keys(APPROVAL_REQUESTERS) as ApprovalKey[]) {
        const token = await login(
            baseUrl,
            'admin-api',
            staffEmail(APPROVAL_REQUESTERS[key]),
            STAFF_PASSWORD,
        );
        out.adjustments[key] = await adjust(token, ordering.orders[key].id);
        const credit = await gqlOk<{ requestCreditTermExtension: { id: string } }>(
            baseUrl,
            'admin-api',
            CREDIT,
            { e: counterpartyErpId(key) },
            token,
        );
        out.creditTerms[key] = credit.requestCreditTermExtension.id;
        if (key === 'a-own') out.probe = await adjust(token, ordering.orders[key].id);
    }
    return out;
}

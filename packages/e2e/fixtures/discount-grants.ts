import { adminGql } from '../helpers/api';

export interface DiscountGrantSeed {
    managerToken: string;
    deptHeadToken: string;
    e2eCounterpartyId: string;
    otherCounterpartyId: string;
}

export async function seedDiscountGrants(seed: DiscountGrantSeed): Promise<void> {
    const { managerToken, deptHeadToken, e2eCounterpartyId, otherCounterpartyId } = seed;
    // The 99% grant on the other counterparty must not leak onto the e2e customer's prices.
    const validTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    for (const [counterpartyId, percent, decision] of [
        [e2eCounterpartyId, 8, 'approved'],
        [otherCounterpartyId, 99, 'approved'],
        // The registry's Rejected filter needs one rejected request.
        [otherCounterpartyId, 3, 'rejected'],
    ] as const) {
        const requested = await adminGql<{ requestDiscountGrant: { id: string } }>(
            `mutation($input: DiscountGrantInput!) { requestDiscountGrant(input: $input) { id } }`,
            {
                input: {
                    priceTypeCode: 'WHOLESALE',
                    percent,
                    validFrom: new Date().toISOString(),
                    validTo,
                    justification: 'e2e seed grant',
                    counterpartyIds: [counterpartyId],
                },
            },
            managerToken,
        );
        await adminGql(
            `mutation($requestId: ID!, $decision: String!) {
                decideDiscountGrantRequest(requestId: $requestId, decision: $decision) { id status }
            }`,
            { requestId: requested.data.requestDiscountGrant.id, decision },
            deptHeadToken,
        );
    }
}

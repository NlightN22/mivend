import { literal, select } from './contour-db';
import { adminCall, superadminToken } from './price-type-access';
import { grantMarker, readRun } from './run-state';

function runRequestIds(): string[] {
    const found = select<{ id: string }>(
        `SELECT id::text FROM approval_request WHERE "requestType" = 'discountGrantApproval'
         AND payload LIKE '%' || ${literal(grantMarker())} || '%'`,
    ).map(r => r.id);
    return [...new Set([...readRun().grantRequestIds, ...found])];
}

function pendingIds(ids: string[]): string[] {
    if (ids.length === 0) return [];
    return select<{ id: string }>(
        `SELECT id::text FROM approval_request WHERE status = 'pending'
         AND id IN (${ids.map(literal).join(',')})`,
    ).map(r => r.id);
}

// Rejects every discount grant request the run created (a rejection consumes nothing); returns what stayed pending.
export async function closeRunGrants(): Promise<string[]> {
    const pending = pendingIds(runRequestIds());
    if (pending.length === 0) return [];
    const token = await superadminToken();
    for (const requestId of pending) {
        const { errors } = await adminCall(
            token,
            `mutation($id: ID!) { decideDiscountGrantRequest(requestId: $id, decision: "rejected",
                comment: "e2e-integration cleanup") { id status } }`,
            { id: requestId },
        );
        if (errors.length > 0)
            console.warn(`closing grant request ${requestId} failed: ${errors[0]}`);
    }
    return pendingIds(pending);
}

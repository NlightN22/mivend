import { adminGql } from '../helpers/api';
import { adminTokenFor } from '../helpers/api-tokens';
import { literal, select, waitFor } from './contour-db';
import { loadContourEnv } from './contour-env';
import { orderByCode } from './order-rows';
import { readRun, type RunOrder } from './run-state';

const CANCEL_WAIT_MS = { on: 180_000, off: 5_000 };

export async function staffCancel(orderId: string): Promise<string> {
    const { superadmin } = loadContourEnv();
    const token = await adminTokenFor(superadmin.username, superadmin.password);
    const { data } = await adminGql<{
        cancelOrderAsStaff: { outcome?: string; reason?: string; message?: string };
    }>(
        `mutation($id: ID!) { cancelOrderAsStaff(orderId: $id) {
            ... on OrderCancelSuccess { outcome } ... on OrderCancelRefused { reason message } } }`,
        { id: orderId },
        token,
    );
    const result = data.cancelOrderAsStaff;
    if (!result.outcome)
        throw new Error(
            `Cleanup cancel of order ${orderId} refused: ${result.reason} ${result.message}`,
        );
    return result.outcome;
}

export interface Leftover {
    code: string;
    problem: string;
}

export function leftovers(order: RunOrder): Leftover[] {
    const found: Leftover[] = [];
    const active = select<{ n: number }>(`SELECT count(*)::int AS n FROM reservation
        WHERE "orderId" = ${literal(order.id)} AND status = 'active'`)[0].n;
    if (active > 0) found.push({ code: order.code, problem: `${active} active reservation(s)` });
    const row = orderByCode(order.code);
    if (row?.uuid) {
        const pending = select<{ n: number }>(`SELECT count(*)::int AS n FROM integration_outbox
            WHERE payload->>'orderUuid' = ${literal(row.uuid)} AND status NOT IN ('published', 'skipped')`)[0]
            .n;
        if (pending > 0)
            found.push({
                code: order.code,
                problem: `${pending} outbox row(s) not published/skipped`,
            });
    }
    if (row && row.state !== 'Cancelled')
        found.push({ code: order.code, problem: `state ${row.state}` });
    return found;
}

// Cancels every order the run placed (staff path, so a registered order is cancelled in the ERP too).
export async function cancelRunOrders(): Promise<Leftover[]> {
    const run = readRun();
    const waitMs = run.exchange === 'on' ? CANCEL_WAIT_MS.on : CANCEL_WAIT_MS.off;
    for (const order of run.orders) {
        if (orderByCode(order.code)?.state !== 'Cancelled') await staffCancel(order.id);
    }
    const left: Leftover[] = [];
    for (const order of run.orders) {
        await waitFor(() => (leftovers(order).length === 0 ? true : undefined), waitMs);
        left.push(...leftovers(order));
    }
    return left;
}

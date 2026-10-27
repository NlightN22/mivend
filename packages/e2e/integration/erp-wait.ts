import { waitFor } from './contour-db';
import { inboxRows, orderByCode, outboxRows, type InboxRow, type OrderRow } from './order-rows';
import { rememberOrder, updateRun } from './run-state';

// The ERP picks commands up once per exchange cycle (6-10 min).
export const ERP_ANSWER_TIMEOUT_MS = 20 * 60_000;
const LOCAL_TIMEOUT_MS = 90_000;

export async function placedOrder(code: string): Promise<OrderRow> {
    const order = await waitFor(() => orderByCode(code), LOCAL_TIMEOUT_MS);
    if (!order) throw new Error(`Order ${code} not found in the contour database`);
    rememberOrder({ id: order.id, code: order.code });
    return order;
}

export async function waitForOrder(
    code: string,
    done: (o: OrderRow) => boolean,
    timeoutMs = LOCAL_TIMEOUT_MS,
): Promise<OrderRow | undefined> {
    return waitFor(() => {
        const order = orderByCode(code);
        return order && done(order) ? order : undefined;
    }, timeoutMs);
}

export async function waitForPublished(
    orderUuid: string,
    eventType: string,
): Promise<{ status: string }[]> {
    const rows = await waitFor(() => {
        const found = outboxRows(orderUuid, eventType);
        return found.some(r => r.status === 'published') ? found : undefined;
    }, LOCAL_TIMEOUT_MS);
    return rows ?? outboxRows(orderUuid, eventType);
}

export async function waitForInbox(
    stream: string,
    orderUuid: string,
    timeoutMs = ERP_ANSWER_TIMEOUT_MS,
): Promise<InboxRow | undefined> {
    const rows = await waitFor(
        () => {
            const found = inboxRows(stream, orderUuid);
            return found.some(r => r.status === 'processed') ? found : undefined;
        },
        timeoutMs,
        5000,
    );
    return rows?.find(r => r.status === 'processed');
}

export async function waitForErpAnswer(stream: string, orderUuid: string): Promise<InboxRow> {
    const row = await waitForInbox(stream, orderUuid);
    if (!row)
        throw new Error(`no ${stream} for ${orderUuid} within ${ERP_ANSWER_TIMEOUT_MS / 1000}s`);
    updateRun({ exchange: 'on' });
    return row;
}

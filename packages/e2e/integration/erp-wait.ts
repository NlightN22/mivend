import { test } from '@playwright/test';
import { waitFor } from './contour-db';
import { inboxRows, orderByCode, outboxRows, type InboxRow, type OrderRow } from './order-rows';
import { readRun, rememberOrder, updateRun } from './run-state';

export const ERP_ANSWER_TIMEOUT_MS = 5 * 60_000;
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

// The run's preflight: the first ERP wait decides once whether the exchange answers.
export function skipWhenExchangeOff(): void {
    test.skip(
        readRun().exchange === 'off',
        'ERP exchange did not answer earlier in this run (switched off)',
    );
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
    skipWhenExchangeOff();
    const row = await waitForInbox(stream, orderUuid);
    if (!row) {
        if (readRun().exchange === 'on')
            throw new Error(`ERP answered earlier but sent no ${stream} for ${orderUuid}`);
        updateRun({ exchange: 'off' });
        test.skip(
            true,
            `no ${stream} from the ERP within ${ERP_ANSWER_TIMEOUT_MS / 1000}s: exchange switched off`,
        );
        throw new Error('unreachable');
    }
    updateRun({ exchange: 'on' });
    return row;
}

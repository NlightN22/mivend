const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const ERP_TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';

interface RunStatus {
    runId: string;
    status: 'pending' | 'processing' | 'done' | 'failed';
    errors: Array<{ index: number; message: string }>;
}

export async function postBatch(exchangeId: string, records: unknown[]): Promise<RunStatus> {
    const res = await fetch(`${SERVER_URL}/erp/import/batch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ERP_TOKEN}`,
        },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) {
        throw new Error(`ERP batch POST failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<RunStatus>;
}

export async function waitForRun(runId: string, timeoutMs = 30_000): Promise<RunStatus> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await fetch(`${SERVER_URL}/erp/import/runs/${runId}`);
        if (!res.ok) throw new Error(`Failed to poll run ${runId}: ${res.status}`);
        const status = (await res.json()) as RunStatus;
        if (status.status === 'done') return status;
        if (status.status === 'failed') {
            throw new Error(`ERP import run ${runId} failed: ${JSON.stringify(status.errors)}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`ERP import run ${runId} timed out after ${timeoutMs}ms`);
}

export async function shopGql<T>(
    query: string,
    variables?: Record<string, unknown>,
    cookie?: string,
): Promise<T> {
    const res = await fetch(`${SERVER_URL}/shop-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
}

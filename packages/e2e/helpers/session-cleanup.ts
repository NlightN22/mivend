import * as fs from 'fs';
import * as path from 'path';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const RUN_START_FILE = path.join(__dirname, '../.auth/run-start.json');

export type ApiName = 'admin-api' | 'shop-api';

export interface TestAccount {
    api: ApiName;
    username: string;
    password: string;
}

interface SessionRow {
    id: string;
    createdAt: string;
    current: boolean;
}

async function call<T>(
    api: ApiName,
    query: string,
    variables: Record<string, unknown>,
    token?: string,
): Promise<{ data: T; token: string | null }> {
    const res = await fetch(`${SERVER_URL}/${api}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(`${api}: ${json.errors[0].message}`);
    return { data: json.data, token: res.headers.get('vendure-auth-token') };
}

export function markRunStart(): void {
    fs.rmSync(path.join(__dirname, '../.auth/admin-tokens.json'), { force: true });
    fs.writeFileSync(RUN_START_FILE, JSON.stringify({ startedAt: new Date().toISOString() }));
}

function runStart(): Date {
    const { startedAt } = JSON.parse(fs.readFileSync(RUN_START_FILE, 'utf8')) as {
        startedAt: string;
    };
    return new Date(startedAt);
}

async function runSessions(api: ApiName, token: string, since: Date): Promise<SessionRow[]> {
    const { data } = await call<{ mySessions: SessionRow[] }>(
        api,
        `query { mySessions { id createdAt current } }`,
        {},
        token,
    );
    return data.mySessions.filter(s => !s.current && new Date(s.createdAt) >= since);
}

// Ends every session the run opened for the account (UI and API logins alike), then its own.
// Returns how many run sessions were still active afterwards: anything above 0 is a leak.
export async function endRunSessions(account: TestAccount): Promise<number> {
    const since = runStart();
    const { token } = await call(
        account.api,
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: account.username, p: account.password },
    );
    if (!token) throw new Error(`Could not log in as ${account.username} to end its sessions`);
    for (const session of await runSessions(account.api, token, since)) {
        await call(
            account.api,
            `mutation($id: ID!) { endSession(id: $id) }`,
            { id: session.id },
            token,
        );
    }
    const left = (await runSessions(account.api, token, since)).length;
    await call(account.api, `mutation { logout { success } }`, {}, token);
    return left;
}

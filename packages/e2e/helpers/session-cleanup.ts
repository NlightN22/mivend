import { E2E_API_USER_AGENT, E2E_USER_AGENT_MARK } from './user-agent';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

export type ApiName = 'admin-api' | 'shop-api';

export interface TestAccount {
    api: ApiName;
    username: string;
    password: string;
}

interface SessionRow {
    id: string;
    userAgent: string | null;
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
            'User-Agent': E2E_API_USER_AGENT,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(`${api}: ${json.errors[0].message}`);
    return { data: json.data, token: res.headers.get('vendure-auth-token') };
}

async function runSessions(api: ApiName, token: string, since: Date): Promise<SessionRow[]> {
    const { data } = await call<{ mySessions: SessionRow[] }>(
        api,
        `query { mySessions { id userAgent createdAt current } }`,
        {},
        token,
    );
    return data.mySessions.filter(
        s =>
            !s.current &&
            new Date(s.createdAt) >= since &&
            (s.userAgent ?? '').includes(E2E_USER_AGENT_MARK),
    );
}

// Ends the sessions this run opened for the account (marked by user agent), then its own.
// Returns how many run sessions were still active afterwards: anything above 0 is a leak.
export async function endRunSessions(account: TestAccount, since: Date): Promise<number> {
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

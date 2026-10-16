import * as fs from 'fs';
import * as path from 'path';

import { adminGql } from './api';

const TOKENS_FILE = path.join(__dirname, '../.auth/admin-tokens.json');

function readTokens(): Record<string, string> {
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) as Record<string, string>;
    } catch {
        return {};
    }
}

async function isAlive(token: string): Promise<boolean> {
    try {
        const { data } = await adminGql<{ activeAdministrator: { id: string } | null }>(
            `query { activeAdministrator { id } }`,
            undefined,
            token,
        );
        return data.activeAdministrator !== null;
    } catch {
        return false;
    }
}

// One Admin API session per account for the whole run: every extra login is a session (issue #231).
export async function adminTokenFor(username: string, password: string): Promise<string> {
    const tokens = readTokens();
    const cached = tokens[username];
    if (cached && (await isAlive(cached))) return cached;
    const { token } = await adminGql<unknown>(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: username, p: password },
    );
    if (!token) throw new Error(`Admin login as ${username} returned no token`);
    fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...readTokens(), [username]: token }));
    return token;
}

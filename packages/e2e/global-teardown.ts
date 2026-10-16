import { MANAGER_ACCOUNTS, SUPERADMIN } from './fixtures/accounts';
import { E2E_CUSTOMER } from './fixtures/seed';
import { CREDIT_BUYER, PASSWORD, PREPAY_BUYER } from './storefront/checkout-credit/helpers';
import { endRunSessions, runStart, type TestAccount } from './helpers/session-cleanup';

// Every account a spec logs in as belongs here, or its sessions outlive the run (issue #231).
const ACCOUNTS: TestAccount[] = [
    { api: 'admin-api', username: SUPERADMIN.identifier, password: SUPERADMIN.password },
    ...Object.values(MANAGER_ACCOUNTS).map(a => ({ api: 'admin-api' as const, ...a })),
    { api: 'shop-api', username: E2E_CUSTOMER.email, password: E2E_CUSTOMER.password },
    { api: 'shop-api', username: CREDIT_BUYER, password: PASSWORD },
    { api: 'shop-api', username: PREPAY_BUYER, password: PASSWORD },
];

export default async function globalTeardown(): Promise<void> {
    const since = runStart();
    if (!since) {
        console.warn('Session cleanup skipped: global setup did not record a run start.');
        return;
    }
    const leaks: string[] = [];
    for (const account of ACCOUNTS) {
        try {
            const left = await endRunSessions(account, since);
            if (left > 0) leaks.push(`${account.username}: ${left}`);
        } catch (err) {
            leaks.push(`${account.username}: cleanup failed (${String(err)})`);
        }
    }
    if (leaks.length > 0) {
        throw new Error(
            `e2e run left active sessions behind (see docs/e2e-testing.md): ${leaks.join(', ')}`,
        );
    }
}

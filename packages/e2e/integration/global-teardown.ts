import { endRunSessions } from '../helpers/session-cleanup';
import { loadContourEnv } from './contour-env';
import { restartContour } from './contour-control';
import { cancelRunOrders } from './run-cleanup';
import { readRun } from './run-state';

// Runs even when a scenario failed: restore the contour, cancel the run's orders, end its sessions.
export default async function globalTeardown(): Promise<void> {
    const contour = loadContourEnv();
    const problems: string[] = [];
    if (readRun().contourBroken) await restartContour();
    for (const left of await cancelRunOrders())
        problems.push(`order ${left.code}: ${left.problem}`);
    const since = new Date(readRun().startedAt);
    const accounts = [
        {
            api: 'shop-api' as const,
            username: contour.customer.email,
            password: contour.customer.password,
        },
        {
            api: 'admin-api' as const,
            username: contour.superadmin.username,
            password: contour.superadmin.password,
        },
        ...(contour.manager ? [{ api: 'admin-api' as const, ...contour.manager }] : []),
    ];
    for (const account of accounts) {
        const left = await endRunSessions(account, since);
        if (left > 0) problems.push(`${account.username}: ${left} session(s) left`);
    }
    if (problems.length > 0)
        throw new Error(`e2e-integration left state behind: ${problems.join('; ')}`);
}

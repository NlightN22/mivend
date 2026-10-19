import { endRunSessions } from '../helpers/session-cleanup';
import { loadContourEnv } from './contour-env';
import { restartContour } from './contour-control';
import { closeRunGrants } from './grant-cleanup';
import { cancelRunOrders } from './run-cleanup';
import { readRun } from './run-state';

// Runs even when a scenario failed: restore the contour, cancel the run's orders, end its sessions.
export default async function globalTeardown(): Promise<void> {
    const contour = loadContourEnv();
    const problems: string[] = [];
    const step = async (name: string, run: () => Promise<void>): Promise<void> => {
        await run().catch((e: unknown) => problems.push(`${name}: ${String(e)}`));
    };
    await step('restart contour', async () => {
        if (readRun().contourBroken) await restartContour();
    });
    await step('cancel run orders', async () => {
        for (const left of await cancelRunOrders())
            problems.push(`order ${left.code}: ${left.problem}`);
    });
    await step('close run discount grants', async () => {
        for (const id of await closeRunGrants()) problems.push(`grant request ${id} still pending`);
    });
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
        await step(`end ${account.username} sessions`, async () => {
            const left = await endRunSessions(account, since);
            if (left > 0) problems.push(`${account.username}: ${left} session(s) left`);
        });
    }
    if (problems.length > 0)
        throw new Error(`e2e-integration left state behind: ${problems.join('; ')}`);
}

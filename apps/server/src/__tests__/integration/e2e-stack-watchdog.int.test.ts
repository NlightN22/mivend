import { describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';

import { stopGroup } from '../access/harness/server-process';
import { watchStack } from '../e2e-stack/watchdog';

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

// A leader with a grandchild, like pnpm -> playwright: the grandchild pid is printed on stdout.
function spawnTree(): Promise<{ leader: ChildProcess; grandchild: number }> {
    const leader = spawn('sh', ['-c', 'sleep 300 & echo $!; wait'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Promise(done =>
        leader.stdout?.once('data', d => done({ leader, grandchild: Number(String(d).trim()) })),
    );
}

describe('e2e stack watchdog', () => {
    it('stops the test run with its grandchildren when a stack process dies', async () => {
        const { leader, grandchild } = await spawnTree();
        const server = spawn('sh', ['-c', 'sleep 0.2'], { detached: true, stdio: 'ignore' });
        const reason = await new Promise<string>(done =>
            watchStack([server], 60_000, why => {
                void stopGroup(leader).then(() => done(why));
            }),
        );
        expect(reason).toMatch(/exited/);
        await new Promise(r => setTimeout(r, 200));
        expect(alive(grandchild)).toBe(false);
    });

    it('stops the run on the global timeout while the stack is healthy', async () => {
        const { leader, grandchild } = await spawnTree();
        const server = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
        const reason = await new Promise<string>(done =>
            watchStack([server], 300, why => void stopGroup(leader).then(() => done(why))),
        );
        expect(reason).toMatch(/exceeded/);
        await new Promise(r => setTimeout(r, 200));
        expect(alive(grandchild)).toBe(false);
        await stopGroup(server);
    });
});

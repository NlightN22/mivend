import type { IntegrationInboxExpiryService } from '../../../integration-inbox-expiry.service';

const LOCK_WAIT_MS = 60_000;

// The advisory lock is database-wide, so another test file's sweep can hold it; wait for it instead of reading "skipped" as "nothing to delete".
export async function drainExpiry(expiry: IntegrationInboxExpiryService): Promise<number> {
    const state = expiry as unknown as { nextPassAt: number };
    const deadline = Date.now() + LOCK_WAIT_MS;
    let deleted = 0;
    for (;;) {
        const slice = await expiry.deleteExpiredTombstones(30_000);
        if (slice.outcome === 'skipped' && Date.now() >= state.nextPassAt) {
            if (Date.now() > deadline) throw new Error('inbox expiry lock was held for 60 s');
            await new Promise(done => setTimeout(done, 200));
            continue;
        }
        deleted += slice.deleted;
        if (slice.finished) return deleted;
    }
}

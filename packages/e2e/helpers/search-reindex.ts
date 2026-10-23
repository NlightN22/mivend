import { adminGql } from './api';

// erp-import emits no search-index events, so a fresh database needs one rebuild.
export async function reindexSearch(token: string): Promise<void> {
    const { data } = await adminGql<{ reindex: { id: string } }>(
        `mutation { reindex { id } }`,
        undefined,
        token,
    );
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const job = await adminGql<{ job: { state: string } | null }>(
            `query($id: ID!) { job(jobId: $id) { state } }`,
            { id: data.reindex.id },
            token,
        );
        const state = job.data.job?.state;
        if (state === 'COMPLETED') return;
        if (state === 'FAILED' || state === 'CANCELLED') throw new Error(`Search reindex ${state}`);
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Search reindex did not finish in 120 s');
}

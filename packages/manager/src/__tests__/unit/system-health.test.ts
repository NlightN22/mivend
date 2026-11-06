import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSystemHealthChecklist } from '../../api/system-health';

function answerWith(body: unknown): void {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body } as Response),
    );
}

describe('fetchSystemHealthChecklist', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns the server-built checklist as is', async () => {
        const items = [
            { id: 'zone', label: 'At least one Zone exists', ok: true, detail: null },
            { id: 'default-tax-zone', label: 'Default tax zone', ok: false, detail: 'Set it' },
        ];
        answerWith({ data: { systemHealthChecklist: items } });
        await expect(fetchSystemHealthChecklist()).resolves.toEqual(items);
    });

    it('rejects when the API answers with an error so the page can show its failure panel', async () => {
        answerWith({
            errors: [{ message: 'You are not currently authorized to perform this action' }],
        });
        await expect(fetchSystemHealthChecklist()).rejects.toThrow(/not currently authorized/);
    });
});

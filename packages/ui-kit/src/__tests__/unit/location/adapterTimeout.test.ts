// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderAAdapter } from '../../../components/MvLocationPicker/adapters/provider-a.adapter';
import { ProviderBAdapter } from '../../../components/MvLocationPicker/adapters/provider-b.adapter';
import { LOAD_TIMEOUT_MS } from '../../../components/MvLocationPicker/adapters/withTimeout';

const options = {
    center: { latitude: 10, longitude: 20 },
    zoom: 8,
    marker: null,
    cooperative: false,
    publicKey: 'key',
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function expectTimeout(work: Promise<unknown>): Promise<void> {
    const settled = expect(work).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 1);
    await settled;
}

describe('adapter load timeouts', () => {
    it('provider-a rejects when ymaps3.ready never resolves', async () => {
        vi.stubGlobal('ymaps3', { ready: new Promise(() => undefined) });
        await expectTimeout(new ProviderAAdapter().mount(document.createElement('div'), options));
    });

    it('provider-a rejects when the script never loads', async () => {
        await expectTimeout(new ProviderAAdapter().mount(document.createElement('div'), options));
        document.head.querySelectorAll('script').forEach(s => s.remove());
    });

    it('provider-b rejects when importLibrary never resolves', async () => {
        vi.stubGlobal('google', {
            maps: { Map: class {}, importLibrary: () => new Promise(() => undefined) },
        });
        await expectTimeout(new ProviderBAdapter().mount(document.createElement('div'), options));
    });

    it('provider-b rejects when the ready callback never fires', async () => {
        vi.spyOn(document.head, 'appendChild').mockImplementation(n => {
            queueMicrotask(() => (n as HTMLScriptElement).onload?.(new Event('load')));
            return n;
        });
        await expectTimeout(new ProviderBAdapter().mount(document.createElement('div'), options));
    });
});

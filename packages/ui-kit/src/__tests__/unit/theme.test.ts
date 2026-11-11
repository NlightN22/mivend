import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

function stubBrowser(opts: { osDark: boolean; saved?: string; storageBlocked?: boolean }): {
    root: {
        dataset: Record<string, string>;
        classList: { toggle: (c: string, on: boolean) => void };
    };
    classes: Set<string>;
    store: Map<string, string>;
    setOsDark: (dark: boolean) => void;
} {
    const store = new Map<string, string>(opts.saved ? [['mivend.theme', opts.saved]] : []);
    const classes = new Set<string>();
    const listeners: Listener[] = [];
    const query = {
        matches: opts.osDark,
        addEventListener: (_: string, cb: Listener) => listeners.push(cb),
    };
    const root = {
        dataset: {} as Record<string, string>,
        classList: {
            toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)),
        },
    };
    vi.stubGlobal('window', { matchMedia: () => query });
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => {
            if (opts.storageBlocked) throw new Error('blocked');
            return store.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
            if (opts.storageBlocked) throw new Error('blocked');
            store.set(k, v);
        },
    });
    return {
        root,
        classes,
        store,
        setOsDark: dark => {
            query.matches = dark;
            listeners.forEach(cb => cb());
        },
    };
}

async function load(
    opts: Parameters<typeof stubBrowser>[0],
): Promise<{ env: ReturnType<typeof stubBrowser>; theme: typeof import('../../theme/theme') }> {
    vi.resetModules();
    await import('vue');
    const env = stubBrowser(opts);
    return { env, theme: await import('../../theme/theme') };
}

describe('theme', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('follows the operating system while no choice is saved', async () => {
        const { env, theme } = await load({ osDark: true });
        theme.initTheme();
        expect(env.root.dataset.theme).toBe('dark');
        expect(env.classes.has('dark')).toBe(true);
        env.setOsDark(false);
        expect(env.root.dataset.theme).toBe('light');
        expect(env.classes.has('dark')).toBe(false);
    });

    it('an explicit choice wins over the system and ignores later system changes', async () => {
        const { env, theme } = await load({ osDark: true });
        theme.initTheme();
        theme.setThemePreference('light');
        expect(env.root.dataset.theme).toBe('light');
        expect(env.store.get('mivend.theme')).toBe('light');
        env.setOsDark(true);
        expect(env.root.dataset.theme).toBe('light');
    });

    it('restores a saved choice and treats an unknown saved value as the system setting', async () => {
        const saved = await load({ osDark: false, saved: 'dark' });
        saved.theme.initTheme();
        expect(saved.env.root.dataset.theme).toBe('dark');

        const junk = await load({ osDark: false, saved: 'purple' });
        const second = junk.theme;
        second.initTheme();
        expect(second.preference.value).toBe('system');
        expect(junk.env.root.dataset.theme).toBe('light');
    });

    it('still applies the theme when storage is blocked', async () => {
        const { env, theme } = await load({ osDark: true, storageBlocked: true });
        theme.initTheme();
        expect(() => theme.setThemePreference('light')).not.toThrow();
        expect(env.root.dataset.theme).toBe('light');
    });
});

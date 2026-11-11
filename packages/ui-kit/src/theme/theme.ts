import { ref, type Ref } from 'vue';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mivend.theme';
const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];
let darkQuery: MediaQueryList | null = null;

function systemQuery(): MediaQueryList {
    darkQuery ??= window.matchMedia('(prefers-color-scheme: dark)');
    return darkQuery;
}

function readSaved(): ThemePreference {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return PREFERENCES.find(p => p === saved) ?? 'system';
    } catch {
        return 'system';
    }
}

export const preference: Ref<ThemePreference> = ref(readSaved());

export const THEME_PREFERENCES: readonly ThemePreference[] = PREFERENCES;

function resolve(): 'light' | 'dark' {
    if (preference.value === 'system') return systemQuery().matches ? 'dark' : 'light';
    return preference.value;
}

function apply(): void {
    const theme = resolve();
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
}

export function setThemePreference(next: ThemePreference): void {
    preference.value = next;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        // storage blocked: the choice lasts for this page view only
    }
    apply();
}

export function initTheme(): void {
    apply();
    systemQuery().addEventListener('change', () => {
        if (preference.value === 'system') apply();
    });
}

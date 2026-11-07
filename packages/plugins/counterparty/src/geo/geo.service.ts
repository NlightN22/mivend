import { Injectable } from '@nestjs/common';
import { Logger, UserInputError } from '@vendure/core';

import { GeoPoint, GeoProvider, GeoSuggestion } from './geo-provider';
import { createGeoProvider, geoEnvPrefix } from './geo-registry';

const MIN_QUERY_LENGTH = 3;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const PAUSE_AFTER_FAILURE_MS = 30_000;
const MAX_QUEUE_WAIT_MS = 3000;

export interface GeoPublicProvider {
    key: string;
    publicKey: string | null;
    params: string | null;
}

export interface GeoPublicConfig {
    providers: GeoPublicProvider[];
    defaultProvider: string | null;
    defaultLat: number | null;
    defaultLng: number | null;
    defaultZoom: number | null;
}

interface ProviderState {
    provider: GeoProvider;
    publicKey: string | null;
    params: string | null;
    cache: Map<string, { at: number; value: unknown }>;
    pausedUntil: number;
    nextSlot: number;
}

function browserParams(prefix: string): string | null {
    const head = `${prefix}_BROWSER_`;
    const entries = Object.entries(process.env)
        .filter(([name, value]) => name.startsWith(head) && name !== `${head}KEY` && value)
        .map(([name, value]) => [name.slice(head.length).toLowerCase(), value]);
    return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
}

@Injectable()
export class GeoService {
    private states: Map<string, ProviderState> | undefined;

    async search(
        rawText: string,
        bias?: GeoPoint,
        providerKey?: string | null,
    ): Promise<GeoSuggestion[]> {
        const state = this.resolve(providerKey);
        this.rejectBrowserOnly(state);
        const text = rawText.trim().slice(0, 200);
        if (!state || text.length < MIN_QUERY_LENGTH) return [];
        const biasKey = bias ? `${bias.lat.toFixed(1)},${bias.lng.toFixed(1)}` : '';
        const result = await this.guarded(state, `s:${text.toLowerCase()}|${biasKey}`, p =>
            p.search(text, bias),
        );
        return (result as GeoSuggestion[] | null) ?? [];
    }

    async reverse(point: GeoPoint, providerKey?: string | null): Promise<string | null> {
        const state = this.resolve(providerKey);
        this.rejectBrowserOnly(state);
        if (!state) return null;
        const key = `r:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
        const address = (await this.guarded(
            state,
            key,
            async p => (await p.reverse(point)) ?? '',
        )) as string | null;
        return address || null;
    }

    publicConfig(): GeoPublicConfig {
        const num = (v?: string): number | null =>
            v && Number.isFinite(Number(v)) ? Number(v) : null;
        const all = [...this.load().values()];
        return {
            providers: all.map(s => ({
                key: s.provider.key,
                publicKey: s.publicKey,
                params: s.params,
            })),
            defaultProvider: this.defaultKey(),
            defaultLat: num(process.env.GEO_DEFAULT_CENTER_LAT),
            defaultLng: num(process.env.GEO_DEFAULT_CENTER_LNG),
            defaultZoom: num(process.env.GEO_DEFAULT_ZOOM),
        };
    }

    private resolve(providerKey?: string | null): ProviderState | null {
        const states = this.load();
        const key = providerKey || this.defaultKey();
        if (!key) return null;
        const state = states.get(key);
        if (!state) throw new UserInputError(`Geo provider is not enabled: ${key}`);
        return state;
    }

    private rejectBrowserOnly(state: ProviderState | null): void {
        if (state?.provider.browserOnly)
            throw new UserInputError(
                `Address search for ${state.provider.key} runs in the browser, not on the server`,
            );
    }

    private defaultKey(): string | null {
        const states = this.load();
        const wanted = process.env.GEO_DEFAULT_PROVIDER;
        if (wanted && states.has(wanted)) return wanted;
        return states.keys().next().value ?? null;
    }

    private load(): Map<string, ProviderState> {
        if (this.states) return this.states;
        const states = new Map<string, ProviderState>();
        const keys = (process.env.GEO_PROVIDERS ?? '')
            .split(',')
            .map(k => k.trim())
            .filter(Boolean);
        for (const key of keys) {
            const prefix = geoEnvPrefix(key);
            const apiKey = process.env[`${prefix}_API_KEY`] ?? '';
            const provider = createGeoProvider(key, {
                apiKey,
                fetch: (url, init) => fetch(url, init),
                baseUrl: process.env[`${prefix}_URL`] || undefined,
                userAgent: process.env.GEO_PROVIDER_USER_AGENT || undefined,
            });
            if (key !== 'open' && !provider.browserOnly && !apiKey) continue;
            states.set(key, {
                provider,
                publicKey: process.env[`${prefix}_BROWSER_KEY`] || null,
                params: browserParams(prefix),
                cache: new Map(),
                pausedUntil: 0,
                nextSlot: 0,
            });
        }
        this.states = states;
        return states;
    }

    private async guarded(
        state: ProviderState,
        key: string,
        call: (p: GeoProvider) => Promise<unknown>,
    ): Promise<unknown> {
        const cached = state.cache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
        if (Date.now() < state.pausedUntil) return null;
        if (!(await this.takeSlot(state, state.provider.minIntervalMs))) return null;
        try {
            const value = await call(state.provider);
            if (state.cache.size >= CACHE_MAX_ENTRIES)
                state.cache.delete(state.cache.keys().next().value as string);
            state.cache.set(key, { at: Date.now(), value });
            return value;
        } catch (error) {
            state.pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
            Logger.warn(
                `Geo provider ${state.provider.key} unavailable, paused for 30 s: ${error instanceof Error ? error.message : String(error)}`,
                'Geo',
            );
            return null;
        }
    }

    private async takeSlot(state: ProviderState, intervalMs: number): Promise<boolean> {
        if (intervalMs <= 0) return true;
        const now = Date.now();
        const start = Math.max(now, state.nextSlot);
        if (start - now > MAX_QUEUE_WAIT_MS) return false;
        state.nextSlot = start + intervalMs;
        if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
        return true;
    }
}

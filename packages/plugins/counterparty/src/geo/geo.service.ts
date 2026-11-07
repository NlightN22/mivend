import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';

import { GeoPoint, GeoProvider, GeoSuggestion } from './geo-provider';
import { createGeoProvider } from './geo-registry';

const MIN_QUERY_LENGTH = 3;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const PAUSE_AFTER_FAILURE_MS = 30_000;
const MAX_QUEUE_WAIT_MS = 3000;

export interface GeoPublicConfig {
    provider: string | null;
    publicKey: string | null;
    defaultLat: number | null;
    defaultLng: number | null;
    defaultZoom: number | null;
}

@Injectable()
export class GeoService {
    private readonly cache = new Map<string, { at: number; value: unknown }>();
    private pausedUntil = 0;
    private nextSlot = 0;
    private provider: GeoProvider | null | undefined;

    async search(rawText: string, bias?: GeoPoint): Promise<GeoSuggestion[]> {
        const text = rawText.trim().slice(0, 200);
        if (text.length < MIN_QUERY_LENGTH) return [];
        const biasKey = bias ? `${bias.lat.toFixed(1)},${bias.lng.toFixed(1)}` : '';
        const result = await this.guarded(`s:${text.toLowerCase()}|${biasKey}`, p =>
            p.search(text, bias),
        );
        return (result as GeoSuggestion[] | null) ?? [];
    }

    async reverse(point: GeoPoint): Promise<string | null> {
        const key = `r:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
        const address = (await this.guarded(key, async p => (await p.reverse(point)) ?? '')) as
            | string
            | null;
        return address || null;
    }

    publicConfig(): GeoPublicConfig {
        const num = (v?: string): number | null =>
            v && Number.isFinite(Number(v)) ? Number(v) : null;
        const active = this.active();
        return {
            provider: active?.key ?? null,
            publicKey: active ? process.env.GEO_PUBLIC_BROWSER_KEY || null : null,
            defaultLat: num(process.env.GEO_DEFAULT_CENTER_LAT),
            defaultLng: num(process.env.GEO_DEFAULT_CENTER_LNG),
            defaultZoom: num(process.env.GEO_DEFAULT_ZOOM),
        };
    }

    private active(): GeoProvider | null {
        if (this.provider === undefined) {
            this.provider = createGeoProvider(process.env.GEO_PROVIDER, {
                apiKey: process.env.GEO_PROVIDER_API_KEY ?? '',
                fetch: (url, init) => fetch(url, init),
                baseUrl: process.env.GEO_PROVIDER_URL || undefined,
                userAgent: process.env.GEO_PROVIDER_USER_AGENT || undefined,
            });
        }
        return this.provider;
    }

    private async guarded(
        key: string,
        call: (p: GeoProvider) => Promise<unknown>,
    ): Promise<unknown> {
        const provider = this.active();
        if (!provider) return null;
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
        if (Date.now() < this.pausedUntil) return null;
        if (!(await this.takeSlot(provider.minIntervalMs))) return null;
        try {
            const value = await call(provider);
            if (this.cache.size >= CACHE_MAX_ENTRIES)
                this.cache.delete(this.cache.keys().next().value as string);
            this.cache.set(key, { at: Date.now(), value });
            return value;
        } catch (error) {
            this.pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
            Logger.warn(
                `Geo provider unavailable, paused for 30 s: ${error instanceof Error ? error.message : String(error)}`,
                'Geo',
            );
            return null;
        }
    }

    private async takeSlot(intervalMs: number): Promise<boolean> {
        if (intervalMs <= 0) return true;
        const now = Date.now();
        const start = Math.max(now, this.nextSlot);
        if (start - now > MAX_QUEUE_WAIT_MS) return false;
        this.nextSlot = start + intervalMs;
        if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
        return true;
    }
}

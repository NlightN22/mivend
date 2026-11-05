import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';

const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 6;
const REQUEST_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const PAUSE_AFTER_FAILURE_MS = 60_000;

interface ProviderResponse {
    suggestions?: Array<{ unrestricted_value?: string }>;
}

@Injectable()
export class AddressSuggestService {
    private readonly cache = new Map<string, { at: number; values: string[] }>();
    private pausedUntil = 0;

    async suggest(rawQuery: string): Promise<string[]> {
        const url = process.env.ADDRESS_SUGGEST_URL;
        const apiKey = process.env.ADDRESS_SUGGEST_API_KEY;
        const query = rawQuery.trim().slice(0, 200);
        if (!url || !apiKey || query.length < MIN_QUERY_LENGTH) return [];

        const key = query.toLowerCase();
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.values;
        if (Date.now() < this.pausedUntil) return [];

        try {
            const values = await this.fetchSuggestions(url, apiKey, query);
            if (this.cache.size >= CACHE_MAX_ENTRIES) {
                this.cache.delete(this.cache.keys().next().value as string);
            }
            this.cache.set(key, { at: Date.now(), values });
            return values;
        } catch (error) {
            this.pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
            Logger.warn(
                `Address suggestions unavailable, paused for 60 s: ${error instanceof Error ? error.message : String(error)}`,
                'AddressSuggest',
            );
            return [];
        }
    }

    private async fetchSuggestions(url: string, apiKey: string, query: string): Promise<string[]> {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Token ${apiKey}`,
            },
            body: JSON.stringify({ query, count: MAX_RESULTS }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`provider answered ${response.status}`);
        const body = (await response.json()) as ProviderResponse;
        return (body.suggestions ?? [])
            .map(s => s.unrestricted_value ?? '')
            .filter(v => v.length > 0);
    }
}

import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';

import type { ResolveQueryRequest } from './query-mapper';
import {
    SearchEndUserBlockedError,
    SearchOffsetTooLargeError,
    SearchRateLimitedError,
} from './search-errors';
import { loggerCtx } from './types';

export interface ResolveQueryResponseItem {
    partOrProductId: string;
    sku: string;
    manufacturer?: string;
    canonicalName: string;
    categoryPath: string[];
    manufacturerCodes: Array<{ lineNumber: number; code: string; manufacturer: string }>;
    hasAvailableOffer: boolean;
    hasPrice: boolean;
    // Open set: search-service may add reasons, consumers must ignore unknown ones.
    matchReasons?: string[];
    score: number;
}

export interface ResolveQueryFacets {
    manufacturer: Array<{ value: string; count: number }>;
    category?: Array<{ value: string; count: number }>;
    characteristics?: Array<{ key: string; normalized: string; count: number }>;
}

export interface ResolveQueryCodeGroup {
    items: ResolveQueryResponseItem[];
    total: number;
}

export interface ResolveQueryResponse {
    items: ResolveQueryResponseItem[];
    total: number;
    skuMatches?: ResolveQueryCodeGroup;
    partNumberMatches?: ResolveQueryCodeGroup;
    manufacturerCodeMatches?: ResolveQueryCodeGroup;
    facets?: ResolveQueryFacets;
}

// A hung search-service must not hold the shop-api request open indefinitely.
// On timeout, the abort surfaces as the same generic failure as any other backend error.
const REQUEST_TIMEOUT_MS = 5000;
// One retry after a 429, waiting at most this long; a longer Retry-After goes straight to the shopper.
const MAX_BACKOFF_SECONDS = 2;
const DEFAULT_RETRY_AFTER_SECONDS = 1;

// Sole HTTP client for search-service's POST /resolve-query (issue #69), authenticated via X-Api-Key.
@Injectable()
export class SearchServiceClient {
    async resolveQuery(
        request: ResolveQueryRequest,
        endUserId?: string,
    ): Promise<ResolveQueryResponse> {
        const baseUrl = process.env.SEARCH_SERVICE_URL;
        if (!baseUrl) {
            throw new Error(
                'SEARCH_SERVICE_URL is required when SEARCH_BACKEND=external — set it in the ' +
                    'contour env file (see docs/environments.md).',
            );
        }

        const apiKey = process.env.SEARCH_SERVICE_API_KEY;
        if (!apiKey) {
            throw new Error(
                'SEARCH_SERVICE_API_KEY is required when SEARCH_BACKEND=external — set it in the ' +
                    'contour env file (see docs/environments.md).',
            );
        }

        const url = `${baseUrl.replace(/\/$/, '')}/resolve-query`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
            ...(endUserId ? { 'X-End-User-Id': endUserId } : {}),
        };

        let response = await this.post(url, headers, request);
        if (response.status === 429) {
            const wait = retryAfterSeconds(response);
            logQuota(response);
            if (wait > MAX_BACKOFF_SECONDS) throw new SearchRateLimitedError(wait);
            await new Promise(resolve => setTimeout(resolve, wait * 1000));
            response = await this.post(url, headers, request);
            if (response.status === 429) {
                logQuota(response);
                throw new SearchRateLimitedError(retryAfterSeconds(response));
            }
        }

        if (!response.ok) {
            // Full response body is logged server-side only (audit finding, mivend.audit.70:
            // the raw body must never reach the GraphQL error surfaced to storefront callers).
            const body = await response.text().catch(() => '');
            Logger.error(
                `search-service /resolve-query returned ${response.status}: ${body}`,
                loggerCtx,
            );
            const code = errorCode(body);
            if (response.status === 403 && code === 'END_USER_BLOCKED') {
                throw new SearchEndUserBlockedError();
            }
            if (response.status === 400 && code === 'OFFSET_TOO_LARGE') {
                throw new SearchOffsetTooLargeError();
            }
            throw new Error(`search-service returned an error (status ${response.status})`);
        }

        return (await response.json()) as ResolveQueryResponse;
    }

    private async post(
        url: string,
        headers: Record<string, string>,
        request: ResolveQueryRequest,
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            return await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: controller.signal,
            });
        } catch (err) {
            // Covers both the abort above and any network-level failure (DNS, connection
            // refused, etc.) — logged with full detail, never echoed to the shop-api caller.
            Logger.error(`search-service /resolve-query request failed: ${String(err)}`, loggerCtx);
            throw new Error('search-service is unavailable');
        } finally {
            clearTimeout(timeout);
        }
    }
}

function retryAfterSeconds(response: Response): number {
    const seconds = Number(response.headers.get('Retry-After'));
    return Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds)
        : DEFAULT_RETRY_AFTER_SECONDS;
}

function logQuota(response: Response): void {
    const h = (name: string): string | null => response.headers.get(name);
    Logger.warn(
        `search-service rate limited: limit=${h('RateLimit-Limit')} remaining=${h('RateLimit-Remaining')} ` +
            `reset=${h('RateLimit-Reset')} retry-after=${h('Retry-After')}`,
        loggerCtx,
    );
}

function errorCode(body: string): string | undefined {
    try {
        const parsed = JSON.parse(body) as { code?: unknown; error?: { code?: unknown } };
        const code = parsed.code ?? parsed.error?.code;
        return typeof code === 'string' ? code : undefined;
    } catch {
        return undefined;
    }
}

import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';

import type { ResolveQueryRequest } from './query-mapper';
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
    matchReasons: string[];
    score: number;
}

export interface ResolveQueryResponse {
    items: ResolveQueryResponseItem[];
    total: number;
}

// A hung search-service must not hold a shop-api `search` request open indefinitely (audit
// finding, mivend.audit.70) — aborts and surfaces as the same generic failure as any other
// unreachable/erroring backend.
const REQUEST_TIMEOUT_MS = 5000;

// Sole HTTP client for search-service's already-implemented POST /resolve-query — the external
// search backend's transport boundary (issue #69). Never called unless SEARCH_BACKEND=external;
// no auth today, per search-service's own contract at /opt/search-platform.
@Injectable()
export class SearchServiceClient {
    async resolveQuery(request: ResolveQueryRequest): Promise<ResolveQueryResponse> {
        const baseUrl = process.env.SEARCH_SERVICE_URL;
        if (!baseUrl) {
            throw new Error(
                'SEARCH_SERVICE_URL is required when SEARCH_BACKEND=external — set it in the ' +
                    'contour env file (see docs/environments.md).',
            );
        }

        const url = `${baseUrl.replace(/\/$/, '')}/resolve-query`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

        if (!response.ok) {
            // Full response body is logged server-side only (audit finding, mivend.audit.70:
            // the raw body must never reach the GraphQL error surfaced to storefront callers).
            const body = await response.text().catch(() => '');
            Logger.error(
                `search-service /resolve-query returned ${response.status}: ${body}`,
                loggerCtx,
            );
            throw new Error(`search-service returned an error (status ${response.status})`);
        }

        return (await response.json()) as ResolveQueryResponse;
    }
}

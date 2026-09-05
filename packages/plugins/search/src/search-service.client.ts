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
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const message = `search-service /resolve-query returned ${response.status}: ${body}`;
            Logger.error(message, loggerCtx);
            throw new Error(message);
        }

        return (await response.json()) as ResolveQueryResponse;
    }
}

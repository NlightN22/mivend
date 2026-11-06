import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiNetworkError, ShopApiError } from '../../api/client';
import { describeLoadError } from '../../api/describeLoadError';

afterEach(() => vi.unstubAllGlobals());

describe('describeLoadError', () => {
    it('maps a fetch TypeError and ApiNetworkError to No connection', () => {
        expect(describeLoadError(new TypeError('Failed to fetch')).title).toBe('No connection');
        expect(describeLoadError(new ApiNetworkError('Network error')).title).toBe('No connection');
    });

    it('maps a timeout abort to The server is busy', () => {
        const err = new ApiNetworkError('This operation was aborted');
        expect(describeLoadError(err).title).toBe('The server is busy');
    });

    it('maps a 5xx response error to The server is busy', () => {
        expect(describeLoadError(new Error('Shop API error: 503')).title).toBe(
            'The server is busy',
        );
    });

    it('maps an offline browser to No connection', () => {
        vi.stubGlobal('navigator', { onLine: false });
        expect(describeLoadError(new Error('boom')).title).toBe('No connection');
    });

    it('falls back to Something went wrong', () => {
        expect(describeLoadError(new Error('Shop API error: 400')).title).toBe(
            'Something went wrong',
        );
        expect(describeLoadError('weird').title).toBe('Something went wrong');
    });

    it('never leaks raw error text', () => {
        const { title, message } = describeLoadError(new Error('Shop API error: 503 stack at x'));
        expect(`${title} ${message}`).not.toMatch(/503|stack|Shop API/);
    });
});

describe('describeLoadError search-service codes', () => {
    it('maps a rate limit with the wait time', () => {
        const err = new ShopApiError('x', { code: 'SEARCH_RATE_LIMITED', retryAfterSeconds: 7 });
        expect(describeLoadError(err)).toEqual({
            title: 'Too many searches',
            message: 'Please wait 7 seconds and try again.',
        });
    });

    it('maps a blocked shopper and a too deep page', () => {
        expect(
            describeLoadError(new ShopApiError('x', { code: 'SEARCH_END_USER_BLOCKED' })).title,
        ).toBe('Search is unavailable');
        expect(
            describeLoadError(new ShopApiError('x', { code: 'SEARCH_REFINE_QUERY' })).title,
        ).toBe('Too many results');
    });

    it('keeps an unknown GraphQL code generic', () => {
        expect(describeLoadError(new ShopApiError('x', { code: 'OTHER' })).title).toBe(
            'Something went wrong',
        );
    });
});

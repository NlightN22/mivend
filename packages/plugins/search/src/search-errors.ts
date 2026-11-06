import { GraphQLError } from 'graphql';

export class SearchRateLimitedError extends GraphQLError {
    constructor(readonly retryAfterSeconds: number) {
        super(`Too many search requests, try again in ${retryAfterSeconds} seconds`, {
            extensions: { code: 'SEARCH_RATE_LIMITED', retryAfterSeconds },
        });
    }
}

export class SearchEndUserBlockedError extends GraphQLError {
    constructor() {
        super('Search is temporarily unavailable', {
            extensions: { code: 'SEARCH_END_USER_BLOCKED' },
        });
    }
}

export class SearchOffsetTooLargeError extends GraphQLError {
    constructor() {
        super('Too many results to page through, refine your query', {
            extensions: { code: 'SEARCH_REFINE_QUERY' },
        });
    }
}

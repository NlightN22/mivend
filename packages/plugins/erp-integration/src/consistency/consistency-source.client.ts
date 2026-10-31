import { ConsistencyClientError } from './consistency-client-error';
import { parseIssuePage, parseSummary } from './consistency-parse';
import type {
    ConsistencyIssuePage,
    ConsistencySourceConfig,
    ConsistencySummary,
} from './consistency-types';

const FETCH_TIMEOUT_MS = 10_000;
export const ISSUES_PAGE_LIMIT = 500;

export interface IssuePageRequest {
    since: string | null;
    cursor: string | null;
}

// One adapter for every source: a source differs only by base URL and key. No retries here, the
// next poll is the retry; each call is a single request so the provider's per-key rate limit holds.
export class ConsistencySourceClient {
    constructor(
        private readonly config: ConsistencySourceConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    async getSummary(): Promise<ConsistencySummary> {
        return parseSummary(await this.get('/v1/consistency/summary', new URLSearchParams()));
    }

    async getIssuesPage(request: IssuePageRequest): Promise<ConsistencyIssuePage> {
        const params = new URLSearchParams({ status: 'all', limit: String(ISSUES_PAGE_LIMIT) });
        if (request.since) params.set('since', request.since);
        if (request.cursor) params.set('cursor', request.cursor);
        return parseIssuePage(await this.get('/v1/consistency/issues', params));
    }

    private async get(path: string, params: URLSearchParams): Promise<unknown> {
        const query = params.toString();
        const url = `${this.config.baseUrl.replace(/\/+$/, '')}${path}${query ? `?${query}` : ''}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await this.fetchImpl(url, {
                headers: { 'X-Api-Key': this.config.apiKey },
                signal: controller.signal,
            });
            if (response.ok) return await this.readJson(response);
            throw await this.toError(response);
        } catch (err) {
            if (err instanceof ConsistencyClientError) throw err;
            throw new ConsistencyClientError('unreachable', errorMessage(err));
        } finally {
            clearTimeout(timeout);
        }
    }

    private async readJson(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            throw new ConsistencyClientError('malformed', 'Response body is not JSON');
        }
    }

    private async toError(response: Response): Promise<ConsistencyClientError> {
        const status = response.status;
        if (status === 401) return new ConsistencyClientError('unauthorized', 'HTTP 401');
        if (status === 403) return new ConsistencyClientError('forbidden', 'HTTP 403');
        if (status === 400) return new ConsistencyClientError('bad-request', 'HTTP 400');
        if (status === 429) {
            const retryAfter = Number(response.headers.get('Retry-After'));
            return new ConsistencyClientError(
                'rate-limited',
                'HTTP 429',
                Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
            );
        }
        if (status === 503) {
            const body: unknown = await response.json().catch(() => null);
            const isNoCheck =
                typeof body === 'object' &&
                body !== null &&
                (body as { error?: unknown }).error === 'no-check-yet';
            if (isNoCheck) return new ConsistencyClientError('no-check-yet', 'no-check-yet');
        }
        return new ConsistencyClientError('server-error', `HTTP ${status}`);
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

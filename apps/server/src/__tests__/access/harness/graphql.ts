export interface GqlResult<T> {
    data: T | null;
    errors: string[];
    token: string | null;
}

export type ApiKind = 'admin-api' | 'shop-api';

export async function gql<T = Record<string, unknown>>(
    baseUrl: string,
    api: ApiKind,
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
): Promise<GqlResult<T>> {
    const response = await fetch(`${baseUrl}/${api}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as {
        data?: T | null;
        errors?: { message: string }[];
    };
    return {
        data: body.data ?? null,
        errors: (body.errors ?? []).map(e => e.message),
        token: response.headers.get('vendure-auth-token'),
    };
}

export async function gqlOk<T = Record<string, unknown>>(
    baseUrl: string,
    api: ApiKind,
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
): Promise<T> {
    const result = await gql<T>(baseUrl, api, query, variables, token);
    if (result.errors.length > 0 || result.data === null)
        throw new Error(`${api} call failed: ${result.errors.join('; ')} for ${query}`);
    return result.data;
}

const LOGIN = `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
    __typename ... on ErrorResult { message } } }`;

export async function login(
    baseUrl: string,
    api: ApiKind,
    username: string,
    password: string,
): Promise<string> {
    const result = await gql<{ login: { __typename: string; message?: string } }>(
        baseUrl,
        api,
        LOGIN,
        { u: username, p: password },
    );
    if (result.data?.login.__typename !== 'CurrentUser' || !result.token)
        throw new Error(
            `${api} login as ${username} failed: ${result.data?.login.message ?? result.errors.join('; ')}`,
        );
    return result.token;
}

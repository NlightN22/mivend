import { signInHeaders, signInUrl } from '@mivend/ui-kit/src/composables/signIn/signInRequest';
import { adminApi, AdminApiError } from './client';
import {
    CounterpartyContractsDocument,
    DeleteContractFileDocument,
    UploadContractFileDocument,
    type CounterpartyContractsQuery,
} from './generated/graphql';

export type ContractRow = CounterpartyContractsQuery['counterpartyContracts']['items'][number];
export type ContractFileItem = ContractRow['files'][number];

export const CONTRACT_FILE_KINDS = ['scan', 'power-of-attorney-scan', 'other'] as const;

export interface ContractsQuery {
    search?: string;
    withoutScan?: boolean;
    page: number;
    pageSize: number;
}

export async function fetchCounterpartyContracts(
    counterpartyId: string,
    q: ContractsQuery,
): Promise<{ items: ContractRow[]; totalItems: number }> {
    const result = await adminApi(CounterpartyContractsDocument, {
        counterpartyId,
        search: q.search || undefined,
        withoutScan: q.withoutScan || undefined,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
    });
    return result.counterpartyContracts;
}

export async function countContractsWithoutScan(counterpartyId: string): Promise<number> {
    const result = await adminApi(CounterpartyContractsDocument, {
        counterpartyId,
        withoutScan: true,
        take: 0,
    });
    return result.counterpartyContracts.totalItems;
}

export async function deleteContractFile(uuid: string): Promise<void> {
    await adminApi(DeleteContractFileDocument, { uuid });
}

// GraphQL multipart request: the generic client only sends JSON.
export async function uploadContractFile(
    contractId: string,
    kind: string,
    file: File,
): Promise<void> {
    const query = String(UploadContractFileDocument);
    const body = new FormData();
    body.append(
        'operations',
        JSON.stringify({ query, variables: { contractId, kind, file: null } }),
    );
    body.append('map', JSON.stringify({ '0': ['variables.file'] }));
    body.append('0', file, file.name);
    const response = await fetch(signInUrl('/admin-api', query), {
        method: 'POST',
        headers: { 'Apollo-Require-Preflight': 'true', ...signInHeaders(query) },
        credentials: 'include',
        body,
    });
    if (!response.ok) throw new Error(`Admin API error: ${response.status}`);
    const json = (await response.json()) as {
        errors?: { message: string; extensions?: Record<string, unknown> }[];
    };
    if (json.errors?.length) {
        throw new AdminApiError(
            json.errors.map(e => e.message).join('; '),
            json.errors[0].extensions,
        );
    }
}

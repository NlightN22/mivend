import type { ContractFileRow } from './contract-file-read.service';

export const CONTRACT_FILE_PATH = '/contract-file';

export function toGqlFile(row: ContractFileRow): ContractFileRow & { downloadUrl: string } {
    return { ...row, downloadUrl: `${CONTRACT_FILE_PATH}/${row.uuid}` };
}

export const CONTRACT_FILE_OPTIONS = Symbol('CONTRACT_FILE_OPTIONS');

export interface CounterpartyPluginOptions {
    // Private directory for contract scans; must never be under AssetServerPlugin's assetUploadDir.
    contractFileDir?: string;
}

export interface ResolvedContractFileOptions {
    dir: string;
}

export const MAX_CONTRACT_FILE_BYTES = 20 * 1024 * 1024;

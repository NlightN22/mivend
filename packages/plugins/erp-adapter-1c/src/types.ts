export interface Adapter1cOptions {
    baseUrl: string;
    username: string;
    password: string;
    timeoutMs?: number;
}

export interface OnecProduct {
    Ref_Key: string;
    Description: string;
    Артикул: string;
    ПометкаУдаления: boolean;
}

export interface OnecOrder {
    Ref_Key: string;
    Номер: string;
    Дата: string;
    Контрагент_Key: string;
    СуммаДокумента: number;
}

export interface OnecChangeResponse<T> {
    value: T[];
    '@odata.nextLink'?: string;
}

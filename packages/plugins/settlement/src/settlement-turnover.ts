// ERP document type name of the sales correction; its debt correction counterpart does not move turnover.
export const SALES_CORRECTION_DOCUMENT_TYPE = 'КорректировкаРеализации';

export const TURNOVER_CATEGORIES: readonly string[] = ['sale', 'return'];

export const movesTurnoverByDefault = (documentType: string, category: string): boolean =>
    TURNOVER_CATEGORIES.includes(category) ||
    (category === 'correction' && documentType === SALES_CORRECTION_DOCUMENT_TYPE);

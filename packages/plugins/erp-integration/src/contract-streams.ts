import * as contracts from '@nlightn22/event-contracts';
import { version } from '@nlightn22/event-contracts/package.json';

// ErpOrderEventSchema is the envelope of erp.order.events.v1, split into the order-* streams.
// The trading point and counterparty commands are mivend's own outbound messages, not inbound streams.
const NOT_EVENT_SCHEMAS = new Set([
    'TradingPointCommandSchema',
    'TradingPointSnapshotSchema',
    'CounterpartyCommandSchema',
    'CounterpartySnapshotSchema',
    'ErpOrderEventSchema',
    'OrderChangedLineSchema',
    'OrderChangedLinkedDocumentSchema',
    'OrganizationSignatorySchema',
    'PowerOfAttorneySchema',
    'AccountingReflectionSchema',
    'CustomerClaimGoodsLineSchema',
    'CustomerClaimServiceLineSchema',
    'EnumValueSchema',
    'NamedRefSchema',
    'OrderCorrectionContainerLineSchema',
    'OrderCorrectionLineSchema',
    'OrderCorrectionServiceLineSchema',
    'SalesCorrectionGoodsLineSchema',
    'SalesCorrectionSerialNumberSchema',
    'SalesCorrectionServiceLineSchema',
    'SalesCorrectionSetComponentSchema',
    'SalesCorrectionTraceabilitySchema',
    'SourceFieldValueSchema',
    'TypedDocumentRefSchema',
    'SettlementEntrySchema',
    'SettlementOrderLinkSchema',
    'ContactInfoSchema',
    'OrganizationContactInfoSchema',
    'SelectionConditionSchema',
    'DiscountBonusLineSchema',
    'DiscountPriceGroupSchema',
    'DiscountProductLineSchema',
    'DiscountRecipientSchema',
    'DiscountSetComponentSchema',
    'DiscountWeekdayWindowSchema',
    'ContactInfoSetEventSchema',
    'OrderStateEventSchema',
    'OrderStateLineSchema',
    'OrderStateLinkedDocumentSchema',
    'PropertyValuesSetEventSchema',
    'StaffRecordSetEventSchema',
    'SetRefSchema',
    'SetDocumentRefSchema',
    'SetEnumValueSchema',
    'PlanParameterValuesValueSchema',
    'SurveyQuestionsStandardAnswerSchema',
]);

// Document and catalog messages nest their table rows and typed values as further message schemas.
const isNestedMessage = (exportName: string): boolean =>
    exportName.endsWith('RowSchema') || exportName.includes('_');

export function streamNameFromSchemaExport(exportName: string): string | null {
    if (!exportName.endsWith('Schema') || exportName.startsWith('Proto')) return null;
    if (NOT_EVENT_SCHEMAS.has(exportName) || isNestedMessage(exportName)) return null;
    let name = exportName.slice(0, -'Schema'.length);
    if (name.endsWith('Changed') && name !== 'OrderChanged') {
        name = name.slice(0, -'Changed'.length);
    } else if (name.endsWith('Set')) {
        name = name.slice(0, -'Set'.length);
    }
    return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function listContractStreams(): string[] {
    const names = Object.keys(contracts)
        .map(streamNameFromSchemaExport)
        .filter((n): n is string => n !== null);
    return [...new Set(names)].sort();
}

export const CONTRACT_VERSION: string = version;

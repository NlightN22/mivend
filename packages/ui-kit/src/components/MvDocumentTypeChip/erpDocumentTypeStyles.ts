import {
    IconAdjustments,
    IconArrowBackUp,
    IconArrowsExchange,
    IconBuildingBank,
    IconBuildingStore,
    IconCash,
    IconCashBanknote,
    IconCashBanknoteOff,
    IconCertificate,
    IconEditCircle,
    IconFileArrowLeft,
    IconFileArrowRight,
    IconFileDollar,
    IconFileImport,
    IconFlag,
    IconGift,
    IconReceipt,
    IconReceiptRefund,
    IconRecycle,
    IconReportAnalytics,
    IconReportMoney,
    IconRotate2,
    IconShoppingCart,
    IconTool,
    IconTruckDelivery,
} from '@tabler/icons-vue';
import type { DocumentTypeStyle } from './documentTypeStyles';

// Keys are the ERP metadata object names; an unlisted one falls back to its category's style.
export const ERP_DOCUMENT_TYPE_STYLES: Record<string, DocumentTypeStyle> = {
    РеализацияТоваровУслуг: { icon: IconShoppingCart, variant: 'success', labelKey: 'sale' },
    ОтчетОРозничныхПродажах: {
        icon: IconReceipt,
        variant: 'success',
        labelKey: 'retailSalesReport',
    },
    ОтчетКомиссионераОПродажах: {
        icon: IconReportMoney,
        variant: 'success',
        labelKey: 'agentSalesReport',
    },
    ОтчетКомитентуОПродажах: {
        icon: IconReportAnalytics,
        variant: 'success',
        labelKey: 'principalSalesReport',
    },
    НарядЗаказ: { icon: IconTool, variant: 'success', labelKey: 'workOrder' },
    ПоступлениеТоваровУслугВНТТ: {
        icon: IconTruckDelivery,
        variant: 'neutral',
        labelKey: 'goodsReceipt',
    },
    ГТДИмпорт: { icon: IconFileImport, variant: 'neutral', labelKey: 'customsImport' },
    ВозвратТоваровОтПокупателя: {
        icon: IconRotate2,
        variant: 'danger',
        labelKey: 'customerReturn',
    },
    ВозвратТоваровПоставщикуИзНТТ: {
        icon: IconArrowBackUp,
        variant: 'danger',
        labelKey: 'supplierReturn',
    },
    КорректировкаРеализации: {
        icon: IconReceiptRefund,
        variant: 'warning',
        labelKey: 'saleCorrection',
    },
    КорректировкаДолга: { icon: IconAdjustments, variant: 'warning', labelKey: 'debtCorrection' },
    КорректировкаДолгаПоВозвратнойТаре: {
        icon: IconRecycle,
        variant: 'warning',
        labelKey: 'packagingDebtCorrection',
    },
    КорректировкаЗаписейРегистров: {
        icon: IconEditCircle,
        variant: 'warning',
        labelKey: 'registerCorrection',
    },
    ВводНачальныхОстатковПоВзаиморасчетам: {
        icon: IconFlag,
        variant: 'neutral',
        labelKey: 'openingBalances',
    },
    ВводОстатковРегистровДляФилиалов: {
        icon: IconBuildingStore,
        variant: 'neutral',
        labelKey: 'branchOpeningBalances',
    },
    ПереоценкаВалютныхСредств: {
        icon: IconArrowsExchange,
        variant: 'neutral',
        labelKey: 'currencyRevaluation',
    },
    НачислениеРетроБонусов: { icon: IconGift, variant: 'success', labelKey: 'retroBonus' },
    ПриходныйКассовыйОрдер: { icon: IconCashBanknote, variant: 'info', labelKey: 'cashReceipt' },
    РасходныйКассовыйОрдер: {
        icon: IconCashBanknoteOff,
        variant: 'warning',
        labelKey: 'cashPayment',
    },
    ПлатежноеПоручениеВходящее: {
        icon: IconBuildingBank,
        variant: 'info',
        labelKey: 'incomingPaymentOrder',
    },
    ПлатежноеПоручениеИсходящее: {
        icon: IconBuildingBank,
        variant: 'warning',
        labelKey: 'outgoingPaymentOrder',
    },
    ПлатежныйОрдерПоступлениеДенежныхСредств: {
        icon: IconCash,
        variant: 'info',
        labelKey: 'fundsIn',
    },
    ПлатежныйОрдерСписаниеДенежныхСредств: {
        icon: IconCash,
        variant: 'warning',
        labelKey: 'fundsOut',
    },
    ОплатаОтПокупателяПлатежнойКартой: { icon: IconCash, variant: 'info', labelKey: 'cardPayment' },
    ПлатежноеТребованиеВыставленное: {
        icon: IconFileDollar,
        variant: 'info',
        labelKey: 'issuedPaymentDemand',
    },
    ПлатежноеТребованиеПолученное: {
        icon: IconFileDollar,
        variant: 'warning',
        labelKey: 'receivedPaymentDemand',
    },
    ИнкассовоеПоручениеПереданное: {
        icon: IconFileArrowRight,
        variant: 'warning',
        labelKey: 'sentCollectionOrder',
    },
    ИнкассовоеПоручениеПолученное: {
        icon: IconFileArrowLeft,
        variant: 'info',
        labelKey: 'receivedCollectionOrder',
    },
    АккредитивПереданный: {
        icon: IconCertificate,
        variant: 'warning',
        labelKey: 'sentLetterOfCredit',
    },
    АккредитивПолученный: {
        icon: IconCertificate,
        variant: 'info',
        labelKey: 'receivedLetterOfCredit',
    },
};

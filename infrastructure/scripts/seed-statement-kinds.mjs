// Statement demo (#342): one customer with a document of every ERP kind and every accounting-flag case.
// Types with a reference category mirror the prod reference; the others are missing from it on purpose.
export const STATEMENT_KINDS_CUSTOMER = {
    email: 'statement-kinds@test.example',
    password: 'StatementKinds123!',
};

const COUNTERPARTY = 'cnt-statement-kinds';
const CONTRACT = 'ctr-statement-kinds';
const ORGANIZATION = 'org-001';
const DAY = 24 * 60 * 60 * 1000;

// [documentType, label, reference category or null, amount, accounting: true | false | null (no block)]
const KINDS = [
    ['РеализацияТоваровУслуг', 'Реализация товаров и услуг', 'sale', 120000, true],
    ['РеализацияТоваровУслуг', 'Реализация товаров и услуг', 'sale', 8000, null],
    ['РеализацияТоваровУслуг', 'Реализация товаров и услуг', 'sale', 7777, false],
    ['ОтчетОРозничныхПродажах', 'Отчет о розничных продажах', null, 3000, true],
    ['ОтчетКомиссионераОПродажах', 'Отчет комиссионера о продажах', 'sale', 15000, true],
    ['ОтчетКомитентуОПродажах', 'Отчет комитенту о продажах', null, 2500, true],
    ['НарядЗаказ', 'Наряд-заказ', 'sale', 4000, null],
    ['ГТДИмпорт', 'ГТД по импорту', null, 1000, true],
    ['ВозвратТоваровОтПокупателя', 'Возврат товаров от покупателя', 'return', -6000, true],
    ['КорректировкаРеализации', 'Корректировка реализации', 'correction', -1200, true],
    ['КорректировкаДолга', 'Корректировка долга', 'correction', 900, null],
    [
        'КорректировкаДолгаПоВозвратнойТаре',
        'Корректировка долга по возвратной таре',
        null,
        300,
        true,
    ],
    ['КорректировкаЗаписейРегистров', 'Корректировка записей регистров', 'correction', -450, true],
    [
        'ВводНачальныхОстатковПоВзаиморасчетам',
        'Ввод начальных остатков по взаиморасчетам',
        null,
        5000,
        null,
    ],
    ['ВводОстатковРегистровДляФилиалов', 'Ввод остатков регистров для филиалов', null, 700, true],
    ['ПереоценкаВалютныхСредств', 'Переоценка валютных средств', null, -80, true],
    ['НачислениеРетроБонусов', 'Начисление ретро-бонусов', 'bonus', -2000, null],
    ['ПриходныйКассовыйОрдер', 'Приходный кассовый ордер', 'payment', -20000, true],
    ['РасходныйКассовыйОрдер', 'Расходный кассовый ордер', 'payment', 1500, true],
    ['ПлатежноеПоручениеВходящее', 'Платежное поручение входящее', 'payment', -30000, true],
    ['ПлатежноеПоручениеИсходящее', 'Платежное поручение исходящее', 'payment', 2000, true],
    [
        'ПлатежныйОрдерПоступлениеДенежныхСредств',
        'Платежный ордер на поступление денежных средств',
        'payment',
        -10000,
        true,
    ],
    [
        'ПлатежныйОрдерСписаниеДенежныхСредств',
        'Платежный ордер на списание денежных средств',
        'payment',
        600,
        true,
    ],
    [
        'ОплатаОтПокупателяПлатежнойКартой',
        'Оплата от покупателя платежной картой',
        'payment',
        -5000,
        true,
    ],
    ['ПлатежноеТребованиеВыставленное', 'Платежное требование выставленное', null, 400, true],
    ['ПлатежноеТребованиеПолученное', 'Платежное требование полученное', null, -400, true],
    ['ИнкассовоеПоручениеПереданное', 'Инкассовое поручение переданное', null, 350, true],
    ['ИнкассовоеПоручениеПолученное', 'Инкассовое поручение полученное', null, -350, true],
    ['АккредитивПереданный', 'Аккредитив переданный', null, 1100, true],
    ['АккредитивПолученный', 'Аккредитив полученный', null, -1100, true],
    ['ПриходныйКассовыйОрдер', 'Приходный кассовый ордер', 'payment', -999, false],
    ['ПоступлениеТоваровУслугВНТТ', 'Поступление товаров и услуг в НТТ', null, 1300, true],
    ['ВозвратТоваровПоставщикуИзНТТ', 'Возврат товаров поставщику из НТТ', null, -1300, true],
    ['ПоступлениеТоваровУслуг', 'Поступление (акты, накладные)', 'supplier', 9000, true],
    ['ВозвратТоваровПоставщику', 'Возврат товаров поставщику', 'supplier', -900, true],
    ['КорректировкаПоступления', 'Корректировка поступления', 'supplier', 90, true],
    ['ПоступлениеДопРасходов', 'Поступление доп. расходов', 'supplier', 60, true],
    ['АвансовыйОтчет', 'Авансовый отчет', 'payroll', 50, null],
    ['НачислениеЗаработнойПлаты', 'Начисление зарплаты', 'payroll', 40, null],
    ['УдержаниеЗаработнойПлаты', 'Удержание зарплаты', 'payroll', -40, null],
];

function statementKindsRecords(now) {
    const at = days => new Date(now + days * DAY).toISOString();
    const version = new Date(now).toISOString();
    const types = new Map();
    for (const [type, label, category] of KINDS) {
        if (category) types.set(type, { documentType: type, label, category });
    }
    const flagsOf = accounting =>
        accounting === null
            ? undefined
            : {
                  reflectedInAccounting: accounting,
                  reflectedInManagementAccounting: true,
                  reflectedInSettlements: true,
              };
    const documents = KINDS.map(([type, label, , amount, accounting], i) => ({
        type: 'settlementDocument',
        data: {
            erpId: `statement-kinds-${i + 1}`,
            version,
            documentType: type,
            documentTypeLabel: label,
            number: String(910001 + i),
            date: at(-60 + i),
            accounting: flagsOf(accounting),
            entries: [
                {
                    organizationErpId: ORGANIZATION,
                    counterpartyErpId: COUNTERPARTY,
                    contractErpId: CONTRACT,
                    currency: 'RUB',
                    amount,
                    dueDate: null,
                },
            ],
        },
    }));
    const shown = KINDS.filter(
        ([, , category, , accounting]) =>
            accounting !== false && category !== 'supplier' && category !== 'payroll',
    );
    return [
        {
            type: 'customer',
            data: { ...STATEMENT_KINDS_CUSTOMER, firstName: 'Statement', lastName: 'Kinds' },
        },
        {
            type: 'counterparty',
            data: {
                erpId: COUNTERPARTY,
                legalName: 'Statement Kinds LLC',
                shortName: 'Statement Kinds',
                inn: '000000000091',
                creditLimit: 150000,
                creditBalance: 0,
                paymentDelayDays: 30,
                priceType: 'WHOLESALE',
                isActive: true,
                mainContractErpId: CONTRACT,
                departmentId: 'dept-sales',
            },
        },
        {
            type: 'customerCounterparty',
            data: {
                customerEmail: STATEMENT_KINDS_CUSTOMER.email,
                counterpartyErpId: COUNTERPARTY,
            },
        },
        {
            type: 'contract',
            data: {
                erpId: CONTRACT,
                counterpartyErpId: COUNTERPARTY,
                name: 'Основной договор поставки',
                organizationId: ORGANIZATION,
                priceTypeId: 'WHOLESALE',
                creditLimit: '150000',
                paymentDelayDays: 30,
                currency: 'RUB',
                isCustomerContract: true,
                isActive: true,
            },
        },
        ...[...types.values()].map((t, i) => ({
            type: 'settlementDocumentType',
            data: {
                ...t,
                version,
                customerVisible: t.category !== 'supplier' && t.category !== 'payroll',
                sortOrder: i,
            },
        })),
        ...documents,
        {
            type: 'settlementBalance',
            data: {
                key: 'statement-kinds-balance',
                version,
                organizationErpId: ORGANIZATION,
                counterpartyErpId: COUNTERPARTY,
                contractErpId: CONTRACT,
                currency: 'RUB',
                openingDate: at(-90),
                openingBalance: 0,
                closingBalance: shown.reduce((sum, k) => sum + k[3], 0),
            },
        },
    ];
}

export async function seedStatementKinds(postBatch) {
    const now = Date.now();
    const records = statementKindsRecords(now);
    console.log(`Sending ${records.length} statement kinds records...`);
    const result = await postBatch(`seed-statement-kinds-${now}`, records);
    console.log(
        `  → status=${result.status} processed=${result.processed} failed=${result.failed}`,
    );
    for (const e of result.errors ?? []) console.warn(`    [${e.index}] ${e.message}`);
}

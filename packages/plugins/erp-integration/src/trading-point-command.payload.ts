import type { TradingPoint } from '@mivend/plugin-counterparty';

// Wire values of the ERP's contact kinds, the same ones the inbound contact parser reads.
const PHONE_KIND = 'Телефон';
const EMAIL_KIND = 'АдресЭлектроннойПочты';
// Contact-information kinds of the ERP dictionary that trading points already use; a contact person's name is not a kind.
const PHONE_KIND_NAME = 'Телефон для оповещения торговой точки';
const EMAIL_KIND_NAME = 'Адрес электронной почты';
const ERP_ID_FOR_CUSTOMER_POINT = /^cust_/;

// Proto-JSON of TradingPointCommand (camelCase names, int64 as a decimal string, the record inside the
// snapshot variant); fields mivend does not store stay unset. The same object is stored in the outbox and decoded by the producer.
export function toTradingPointCommandPayload(
    point: TradingPoint,
    counterpartyErpId: string,
    eventId: string,
    occurredAt: Date,
): Record<string, unknown> {
    const primary = point.contacts.find(c => c.isPrimary) ?? point.contacts[0];
    const contactInfos = point.contacts.flatMap(c => [
        ...(c.phone
            ? [
                  {
                      type: PHONE_KIND,
                      kindName: PHONE_KIND_NAME,
                      isPrimary: c.isPrimary,
                      presentation: c.phone,
                  },
              ]
            : []),
        ...(c.email
            ? [
                  {
                      type: EMAIL_KIND,
                      kindName: EMAIL_KIND_NAME,
                      isPrimary: c.isPrimary,
                      presentation: c.email,
                  },
              ]
            : []),
    ]);
    const optional = (key: string, value: unknown): Record<string, unknown> =>
        value === null || value === undefined ? {} : { [key]: value };
    return {
        eventId,
        occurredAt: occurredAt.toISOString(),
        uuid: point.uuid,
        version: String(point.version),
        ...(ERP_ID_FOR_CUSTOMER_POINT.test(point.erpId) ? {} : { erpId: point.erpId }),
        tradingPointSnapshot: {
            name: point.name,
            counterpartyId: counterpartyErpId,
            isActive: point.isActive,
            address: point.address,
            ...optional('latitude', point.latitude),
            ...optional('longitude', point.longitude),
            ...optional('contactPhone', primary?.phone),
            ...optional('workingHours', point.workingHours),
            ...optional('deliveryComment', point.deliveryComment),
            isHidden: point.customerStatus === 'hidden',
            contactInfos,
        },
    };
}

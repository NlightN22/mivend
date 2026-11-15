import type { CounterpartySnapshot } from '@mivend/plugin-counterparty';

// Wire values of the ERP's contact kinds, the same ones the inbound contact parser reads.
const WIRE_KINDS: Record<string, string> = {
    phone: 'Телефон',
    email: 'АдресЭлектроннойПочты',
    address: 'Адрес',
    web: 'ВебСтраница',
};

// Proto-JSON of CounterpartyCommand (camelCase names, int64 as a decimal string); a column mivend does not
// store stays unset. The same object is stored in the outbox and decoded by the producer.
export function toCounterpartyCommandPayload(
    snapshot: CounterpartySnapshot,
    eventId: string,
    occurredAt: Date,
): Record<string, unknown> {
    const c = snapshot.counterparty;
    const optional = (key: string, value: unknown): Record<string, unknown> =>
        value === null || value === undefined ? {} : { [key]: value };
    return {
        eventId,
        occurredAt: occurredAt.toISOString(),
        erpId: c.erpId,
        version: String(c.version),
        counterpartySnapshot: {
            name: c.shortName,
            ...optional('fullName', c.fullName),
            ...optional('inn', c.inn),
            ...optional('kpp', c.kpp),
            ...optional('ogrnip', c.ogrnip),
            ...optional('okpo', c.okpo),
            ...optional('legalType', c.legalType),
            ...optional('legalFormId', c.legalFormId),
            ...optional('regionId', c.regionId),
            ...optional('legalAddress', c.legalAddress),
            ...optional('factualAddress', c.factualAddress),
            ...optional('phone', c.phone),
            ...optional('officialEmail', c.officialEmail),
            ...optional('erpGroupLabel', c.erpGroupLabel),
            ...optional('managerId', snapshot.managerId),
            managerIds: snapshot.managerIds,
            contactInfos: snapshot.contactInfos.flatMap(info =>
                WIRE_KINDS[info.type]
                    ? [
                          {
                              type: WIRE_KINDS[info.type],
                              ...optional('kindName', info.label),
                              isPrimary: info.isPrimary,
                              presentation: info.value,
                          },
                      ]
                    : [],
            ),
        },
    };
}

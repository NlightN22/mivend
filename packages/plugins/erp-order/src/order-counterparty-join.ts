// A text-cast join estimates so high that Postgres JIT-compiles it (seconds per query); a
// numeric id compares as an integer. Non-numeric or zero-padded text never matched a counterparty id.
export function orderCounterpartyJoinSql(orderAlias: string): string {
    const ref = `COALESCE("${orderAlias}"."customFieldsCounterpartyid", customer."customFieldsCounterpartyid")`;
    return `counterparty.id = CASE WHEN ${ref} ~ '^[1-9][0-9]{0,8}$' THEN ${ref}::int END`;
}

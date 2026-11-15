import { fromJson, toBinary } from '@bufbuild/protobuf';
import { CounterpartyCommandSchema } from '@nlightn22/event-contracts';

// Topic named by the contract (key = erp_id); the package exports no constant for it.
export const COUNTERPARTY_COMMANDS_TOPIC = 'mivend.counterparty.commands.v1';

// Plain protobuf like the inbound streams; a field outside the contract throws, so a bad row fails
// into the outbox retry policy instead of being sent half-valid.
export function encodeCounterpartyCommand(payload: Record<string, unknown>): Uint8Array {
    return toBinary(
        CounterpartyCommandSchema,
        fromJson(CounterpartyCommandSchema, payload as never),
    );
}

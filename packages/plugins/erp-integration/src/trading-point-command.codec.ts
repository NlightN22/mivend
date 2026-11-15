import { fromJson, toBinary } from '@bufbuild/protobuf';
import { TradingPointCommandSchema } from '@nlightn22/event-contracts';

// Topic named by the contract (mivend.trading-point.commands.v1); the package exports no constant for it.
export const TRADING_POINT_COMMANDS_TOPIC = 'mivend.trading-point.commands.v1';

// Plain protobuf like the inbound streams; an unknown or malformed field throws, so a bad row fails
// into the outbox retry policy instead of being sent half-valid.
export function encodeTradingPointCommand(payload: Record<string, unknown>): Uint8Array {
    return toBinary(
        TradingPointCommandSchema,
        fromJson(TradingPointCommandSchema, payload as never),
    );
}

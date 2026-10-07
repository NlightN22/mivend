export type StreamDrift = 'NOT_CONSUMED' | 'NOT_IN_CONTRACT' | 'UNKNOWN_STREAM' | null;

export interface StreamHealthLag {
    topic: string;
    totalLag: string | null;
    polledAt: Date;
    partitions: {
        partition: number;
        committedOffset: string | null;
        endOffset: string;
        lag: string | null;
    }[];
}

export interface StreamHealthBacklog {
    pending: number;
    processing: number;
    failed: number;
    oldestPendingAt: Date | null;
}

export interface StreamHealthInput {
    contractStreams: readonly string[];
    consumedStreams: readonly string[];
    ignoredStreams: Readonly<Record<string, string>>;
    topics: Readonly<Record<string, string>>;
    lagByStream: ReadonlyMap<string, StreamHealthLag>;
    backlogByStream: ReadonlyMap<string, StreamHealthBacklog>;
}

export interface StreamHealthRow {
    stream: string;
    topic: string | null;
    inContract: boolean;
    consumed: boolean;
    ignoredReason: string | null;
    drift: StreamDrift;
    lag: StreamHealthLag | null;
    pending: number;
    processing: number;
    failed: number;
    oldestPendingAt: Date | null;
}

function driftOf(
    inContract: boolean,
    consumed: boolean,
    ignored: boolean,
    hasSignals: boolean,
): StreamDrift {
    if (inContract && !consumed) return ignored ? null : 'NOT_CONSUMED';
    if (!inContract && consumed) return 'NOT_IN_CONTRACT';
    if (!inContract && !consumed && hasSignals) return 'UNKNOWN_STREAM';
    return null;
}

export function buildStreamHealthRows(input: StreamHealthInput): StreamHealthRow[] {
    const all = new Set<string>([
        ...input.contractStreams,
        ...input.consumedStreams,
        ...input.lagByStream.keys(),
        ...input.backlogByStream.keys(),
    ]);
    const contract = new Set(input.contractStreams);
    const consumed = new Set(input.consumedStreams);

    return [...all].sort().map(stream => {
        const backlog = input.backlogByStream.get(stream);
        const lag = input.lagByStream.get(stream) ?? null;
        const ignoredReason = input.ignoredStreams[stream] ?? null;
        return {
            stream,
            topic: input.topics[stream] ?? lag?.topic ?? null,
            inContract: contract.has(stream),
            consumed: consumed.has(stream),
            ignoredReason,
            drift: driftOf(
                contract.has(stream),
                consumed.has(stream),
                ignoredReason !== null,
                backlog !== undefined || lag !== null,
            ),
            lag,
            pending: backlog?.pending ?? 0,
            processing: backlog?.processing ?? 0,
            failed: backlog?.failed ?? 0,
            oldestPendingAt: backlog?.oldestPendingAt ?? null,
        };
    });
}

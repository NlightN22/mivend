import { Logger } from '@vendure/core';
import { PubSubEngine } from 'graphql-subscriptions';
import { Client } from 'pg';

const LOGGER_CTX = 'NotificationPgPubSub';
// Postgres rejects NOTIFY payloads of 8000 bytes or more.
const MAX_PAYLOAD_BYTES = 7900;
const RECONNECT_DELAY_MS = 1000;

type Listener = (payload: unknown) => void;

// Dates cross the wire as ISO strings; restore the *At columns so resolvers see what an in-process PubSub delivers.
function reviveDates(key: string, value: unknown): unknown {
    return key.endsWith('At') && typeof value === 'string' ? new Date(value) : value;
}

// Delivers across processes (shop and admin servers, workers) through Postgres LISTEN/NOTIFY.
export class PgPubSub extends PubSubEngine {
    private readonly listeners = new Map<number, { trigger: string; onMessage: Listener }>();
    private nextId = 1;
    private client: Promise<Client> | null = null;
    private closed = false;

    constructor(
        private readonly createClient: () => Client,
        private readonly channel: string = 'mivend_notification',
    ) {
        super();
    }

    async publish(trigger: string, payload: unknown): Promise<void> {
        const body = JSON.stringify({ trigger, payload });
        if (Buffer.byteLength(body) > MAX_PAYLOAD_BYTES) {
            throw new Error(`Notification payload for "${trigger}" exceeds the NOTIFY size limit`);
        }
        const client = await this.connect();
        await client.query('SELECT pg_notify($1, $2)', [this.channel, body]);
    }

    async subscribe(trigger: string, onMessage: Listener): Promise<number> {
        await this.connect();
        const id = this.nextId++;
        this.listeners.set(id, { trigger, onMessage });
        return id;
    }

    unsubscribe(id: number): void {
        this.listeners.delete(id);
    }

    async onModuleDestroy(): Promise<void> {
        this.closed = true;
        const pending = this.client;
        this.client = null;
        if (pending) await (await pending).end();
    }

    private connect(): Promise<Client> {
        if (!this.client) {
            this.client = this.open().catch(err => {
                this.client = null;
                throw err;
            });
        }
        return this.client;
    }

    private async open(): Promise<Client> {
        const client = this.createClient();
        client.on('notification', msg => this.dispatch(msg.payload));
        client.on('error', err =>
            Logger.error(`Listener connection failed: ${err.message}`, LOGGER_CTX),
        );
        client.on('end', () => this.reconnect());
        await client.connect();
        await client.query(`LISTEN ${this.channel}`);
        return client;
    }

    private reconnect(): void {
        if (this.closed) return;
        this.client = null;
        setTimeout(() => {
            if (this.closed || this.listeners.size === 0) return;
            this.connect().catch(err => {
                Logger.error(`Reconnect failed: ${err.message}`, LOGGER_CTX);
                this.reconnect();
            });
        }, RECONNECT_DELAY_MS).unref();
    }

    private dispatch(raw: string | undefined): void {
        if (!raw) return;
        const { trigger, payload } = JSON.parse(raw, reviveDates) as {
            trigger: string;
            payload: unknown;
        };
        for (const l of this.listeners.values()) {
            if (l.trigger === trigger) l.onMessage(payload);
        }
    }
}

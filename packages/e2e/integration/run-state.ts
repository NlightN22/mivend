import * as fs from 'fs';
import * as path from 'path';

const RUN_FILE = path.join(__dirname, '../.auth/integration-run.json');

export interface RunOrder {
    id: string;
    code: string;
}

export interface RunState {
    startedAt: string;
    orders: RunOrder[];
    exchange: 'unknown' | 'on' | 'off';
    contourBroken: boolean;
}

export function readRun(): RunState {
    return JSON.parse(fs.readFileSync(RUN_FILE, 'utf8')) as RunState;
}

function writeRun(state: RunState): void {
    fs.mkdirSync(path.dirname(RUN_FILE), { recursive: true });
    fs.writeFileSync(RUN_FILE, JSON.stringify(state, null, 2));
}

export function startRun(): void {
    writeRun({
        startedAt: new Date().toISOString(),
        orders: [],
        exchange: 'unknown',
        contourBroken: false,
    });
}

export function updateRun(change: Partial<RunState>): void {
    writeRun({ ...readRun(), ...change });
}

export function rememberOrder(order: RunOrder): void {
    const state = readRun();
    if (!state.orders.some(o => o.id === order.id))
        writeRun({ ...state, orders: [...state.orders, order] });
}

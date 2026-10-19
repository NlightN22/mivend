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
    grantRequestIds: string[];
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

export function previousRunLeftContourBroken(): boolean {
    return fs.existsSync(RUN_FILE) && readRun().contourBroken;
}

export function startRun(): void {
    writeRun({
        startedAt: new Date().toISOString(),
        orders: [],
        grantRequestIds: [],
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

export function rememberGrantRequest(requestId: string): void {
    const state = readRun();
    if (!state.grantRequestIds.includes(requestId))
        writeRun({ ...state, grantRequestIds: [...state.grantRequestIds, requestId] });
}

// Goes into every grant justification of the run, so cleanup also finds a request whose id was lost.
export function grantMarker(): string {
    return `e2e-int-${readRun().startedAt.replace(/\D/g, '')}`;
}

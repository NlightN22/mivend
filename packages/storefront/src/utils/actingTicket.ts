export const ACTING_ROUTE = '/acting';

let pendingTicket: string | null = null;

// The ticket is taken from the fragment (preferred) or query and stripped from the address bar
// before anything else can read, log or share it.
export function captureActingTicket(loc: Location = location, hist: History = history): void {
    if (loc.pathname !== ACTING_ROUTE) return;
    const fromHash = new URLSearchParams(loc.hash.replace(/^#/, '')).get('ticket');
    const fromQuery = new URLSearchParams(loc.search).get('ticket');
    pendingTicket = fromHash || fromQuery || null;
    hist.replaceState(hist.state, '', ACTING_ROUTE);
}

export function takeActingTicket(): string | null {
    const ticket = pendingTicket;
    pendingTicket = null;
    return ticket;
}

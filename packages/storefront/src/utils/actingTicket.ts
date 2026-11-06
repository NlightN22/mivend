export const ACTING_ROUTE = '/acting';

let pendingTicket: string | null = null;

// Only the fragment is accepted: a query string would reach access logs and the Referer header.
// The address bar is stripped before anything else can read or share it.
export function captureActingTicket(loc: Location = location, hist: History = history): void {
    if (loc.pathname !== ACTING_ROUTE) return;
    pendingTicket = new URLSearchParams(loc.hash.replace(/^#/, '')).get('ticket') || null;
    hist.replaceState(hist.state, '', ACTING_ROUTE);
}

export function takeActingTicket(): string | null {
    const ticket = pendingTicket;
    pendingTicket = null;
    return ticket;
}

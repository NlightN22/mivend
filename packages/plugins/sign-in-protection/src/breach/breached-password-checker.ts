export type BreachVerdict = 'breached' | 'clean' | 'unavailable';

export interface BreachedPasswordChecker {
    check(password: string): Promise<BreachVerdict>;
}

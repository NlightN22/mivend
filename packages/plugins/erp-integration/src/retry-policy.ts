// Pure decision extracted from IntegrationOutboxProcessorService so retry/dead-letter behavior
// is unit-testable without a DB or a mocked Kafka producer.
export function shouldDeadLetter(retryCountAfterThisFailure: number, maxRetry: number): boolean {
    return retryCountAfterThisFailure >= maxRetry;
}

const RETRY_STATUSES = new Set([502, 503, 504, 522, 523, 524]);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchWithRetry = async (
    input: RequestInfo | URL,
    init?: RequestInit,
    attempts = 2,
): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(input, init);
            if (attempt < attempts && RETRY_STATUSES.has(response.status)) {
                await wait(150 * attempt);
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
            if (attempt >= attempts) throw error;
            await wait(150 * attempt);
        }
    }
    throw lastError instanceof Error ? lastError : new Error('fetchWithRetry exhausted');
};

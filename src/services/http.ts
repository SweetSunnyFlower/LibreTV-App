const DEFAULT_TIMEOUT_MS = 15000;

function createAbortError() {
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export async function requestWithTimeout<T>(
  url: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T> | T,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const externalSignal = init.signal;
  if (externalSignal?.aborted) throw createAbortError();

  const controller = new AbortController();
  let timedOut = false;
  const handleExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', handleExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`请求失败：HTTP ${response.status}`);
    }
    return await consume(response);
  } catch (error) {
    if (timedOut) throw new Error('请求超时，请稍后重试');
    if (externalSignal?.aborted || controller.signal.aborted) throw createAbortError();
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', handleExternalAbort);
  }
}

export function fetchTextWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  return requestWithTimeout(url, init, (response) => response.text(), timeoutMs);
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const text = await fetchTextWithTimeout(url, init, timeoutMs);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('服务器返回的数据格式无效');
  }
}

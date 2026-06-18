// 第三方接口默认超时（毫秒）。Node 全局 fetch 对"连上但服务端不返回"不会自动超时，
// 必须用 AbortController 主动中断，否则一次挂起的请求会卡死调用方（如订单同步定时循环）。
export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

// 通用 promise 超时：给"可能永远不 resolve"的异步操作兜底（如定时同步整轮）。
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${timeoutMs}ms）`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求超时（${timeoutMs}ms 未响应）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

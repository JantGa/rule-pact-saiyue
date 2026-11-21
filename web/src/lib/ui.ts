export function shortAddress(address: string, size = 5) {
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function statusLabel(status: string) {
  return (
    {
      inviting: "等待队友",
      ready: "等待开局",
      active: "比赛进行中",
      completed: "已结束"
    }[status] || status
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  } catch {
    throw new Error(
      "无法连接 Rule pact 服务端。请确认已运行 npm run dev，并访问 http://localhost:3100"
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `接口 ${url} 没有连接当前 Rule pact 服务（HTTP ${response.status}）。请确认页面地址是 http://localhost:3100，且 3100 端口运行的是本项目。`
    );
  }

  let payload: T & { error?: string };
  try {
    payload = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error("服务端返回了无法解析的数据，请重启 npm run dev 后重试。");
  }
  if (!response.ok) throw new Error(payload.error || `请求失败（HTTP ${response.status}）`);
  return payload;
}

export const SESSION_EVENT = "rulepact:session";


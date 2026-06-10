export type AdminOverview = {
  metrics: {
    userCount: number;
    conversionCount: number;
    copyEventCount: number;
    pendingAttributionCount: number;
    orderClaimCount: number;
  };
};

export type AdminUser = {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  conversionCount: number;
  copyEventCount: number;
  claimCount: number;
  createdAt: string;
};

export type AdminDealStep = {
  content: string;
  copyType?: "link" | "password" | null;
  copyValue?: string | null;
  images?: string[];
  videoUrl?: string | null;
};

export type AdminDeal = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  pinned: boolean;
  steps: AdminDealStep[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminClaim = {
  id: string;
  userId: string;
  userOpenid: string;
  orderSuffix: string;
  screenshotUrl: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

export type AdminConfig = {
  config: {
    dingdanxiaPid: string;
    commissionSharingRatio: number;
    attributionWindowHours: number;
    highValueReviewThresholdCents: number;
  };
};

export type PendingAttribution = {
  id: string;
  userId: string | null;
  confidence: number;
  reason: string;
  status: string;
  order: {
    id: string;
    itemTitle: string;
    orderStatus: string;
    estimatedCommissionCents: number;
  };
};

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function mediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.startsWith("/") ? `${apiBaseUrl}${url}` : url;
}

export async function uploadAdminFile(file: File, adminToken: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${apiBaseUrl}/api/admin/uploads`, {
    method: "POST",
    headers: { "x-admin-token": adminToken },
    body: form
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `上传失败：${response.status}`);
  }
  const { url } = (await response.json()) as { url: string };
  return url;
}

export async function fetchAdminApi<T>(path: string, adminToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`后台接口请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

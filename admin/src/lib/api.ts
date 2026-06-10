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
};

export type AdminDeal = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  steps: AdminDealStep[];
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

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

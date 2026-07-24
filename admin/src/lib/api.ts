export type AdminOverview = {
  metrics: {
    userCount: number;
    conversionCount: number;
    copyEventCount: number;
    pendingAttributionCount: number;
    orderClaimCount: number;
  };
};

export type SyncRun = {
  id: string;
  trigger: string;
  ok: boolean;
  taobaoSynced: number;
  taobaoAttributed: number;
  jdSynced: number;
  jdAttributed: number;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
};

export type SyncStatus = {
  latest: SyncRun | null;
  intervalMinutes: number;
};

export type AdminUser = {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  rebateRatio: number | null;
  conversionCount: number;
  copyEventCount: number;
  claimCount: number;
  inviterId: string | null;
  inviterNickname: string | null;
  downlineCount: number;
  createdAt: string;
};

export type Downline = {
  id: string;
  nickname: string | null;
  openid: string;
  createdAt: string;
  contributedCents: number;
};

export type AdminConversion = {
  id: string;
  userId: string;
  userNickname: string | null;
  userOpenid: string;
  itemId: string;
  itemTitle: string;
  platform: string;
  estimatedRebateCents: number;
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
  viewCount: number;
  visitorCount: number;
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

export type AdminSetting = {
  key: string;
  label: string;
  secret: boolean;
  value: string;
  configured: boolean;
};

export type AdminConfig = {
  config: {
    zhetaokePid: string;
    commissionSharingRatio: number;
    attributionWindowHours: number;
    highValueReviewThresholdCents: number;
    exchangeEnabled: boolean;
    referralCommissionRatio: number;
    referralEnabled: boolean;
    ordersTabEnabled: boolean;
  };
};

export type AdminWithdrawal = {
  id: string;
  userId: string;
  userNickname: string | null;
  userOpenid: string;
  amountCents: number;
  status: string;
  payAccount: string;
  payType: string;
  notes: string | null;
  createdAt: string;
};

export type AdminOrder = {
  id: string;
  tbkOrderId: string;
  itemTitle: string;
  payTime: string;
  payAmountCents: number;
  estimatedCommissionCents: number;
  settledCommissionCents: number | null;
  orderStatus: string;
  attribution: {
    id: string;
    status: string;
    confidence: number;
    reason: string;
    userId: string | null;
    userNickname: string | null;
  } | null;
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
      ...(init.body != null ? { "content-type": "application/json" } : {}),
      "x-admin-token": adminToken,
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`后台接口请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

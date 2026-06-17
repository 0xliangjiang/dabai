// 订单状态进度：付款 < 已收货 < 已结算；退款/失效为终态（折淘客报来即覆盖）
const STATUS_RANK: Record<string, number> = {
  paid: 0,
  received: 1,
  settled: 2
};

// 同步状态与后台手动状态取「更靠后」者：
// - 折淘客报退款/失效 → 以折淘客为准（真实退款必须覆盖手动标记）
// - 否则取进度更高的（手动标记已收货后，折淘客仍报已付款时保留已收货；
//   次月真结算时折淘客报已结算，会自动升级，手动标记不会卡住后续流转）
export function resolveEffectiveStatus(syncedStatus: string, manualStatus: string | null): string {
  if (syncedStatus === "refunded" || syncedStatus === "invalid") return syncedStatus;
  if (!manualStatus) return syncedStatus;
  const sr = STATUS_RANK[syncedStatus] ?? 0;
  const mr = STATUS_RANK[manualStatus] ?? 0;
  return mr > sr ? manualStatus : syncedStatus;
}

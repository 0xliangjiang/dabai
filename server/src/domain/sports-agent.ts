export const MIN_SPORTS_STEPS = 1;
export const MAX_SPORTS_STEPS = 98_800;

export type SportsChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SportsIntent =
  | { type: "set_steps"; steps: number }
  | { type: "ask_steps" }
  | { type: "chat"; reply: string };

const MUTATION_PATTERN =
  /(?:刷步|刷到|刷成|刷\s*(?:一|两|二|三|四|五|六|七|八|九|十|百|千|万|\d)|步数.{0,8}(?:改|调|设|设置|同步|上传)|(?:今天(?:的)?(?:运动)?目标|今日(?:运动)?目标|运动目标).{0,8}(?:设|设置|定|调整|为|到|[零〇一二两三四五六七八九十百千万\d])|目标.{0,4}(?:设|设置|定|调整)(?:为|到)?|(?:改|调|设|设置|调整|同步|上传|弄到).{0,8}(?:步数|步)|帮我.{0,8}(?:刷|改|调|设)|(?:来|搞)(?:个|到)?\s*(?:[零〇一二两三四五六七八九十百千万]|\d))/i;
const NEGATED_MUTATION_PATTERN = /(?:不要|别|取消|停止|不用|无需).{0,10}(?:刷|改|调|设|同步|上传).{0,8}(?:步|步数)?/i;
const INFORMATIONAL_PATTERN = /^(?:怎么|如何|怎样|为什么|什么是|查询|查看|分析|统计)|(?:刷步|步数|运动目标).{0,8}(?:上限|范围|最多|最少|有什么用)/i;
const PENDING_STEP_PATTERN = /(?:想要|需要|告诉我|请输入|请说).{0,12}(?:多少|目标).{0,5}步|(?:多少|目标)步数/i;
const PURE_STEP_VALUE_PATTERN = /^[\s，,。.!！?？]*(?:\d[\d,]*(?:\.\d+)?\s*(?:万|w|k|千)?|[零〇一二两三四五六七八九十百千万]+)\s*(?:步)?\s*(?:吧|左右|就行|可以)?[\s，,。.!！?？]*$/i;

export function recognizeSportsIntent(input: string, history: SportsChatMessage[] = []): SportsIntent {
  const text = normalizeText(input);
  if (!text) return { type: "chat", reply: "告诉我今天的运动目标，例如“今天运动目标 20000 步”。" };

  if (NEGATED_MUTATION_PATTERN.test(text)) {
    return { type: "chat", reply: "好的，本次不会设置今天的运动目标。" };
  }
  if (INFORMATIONAL_PATTERN.test(text)) {
    return { type: "chat", reply: "今天的运动目标范围为 1-98800 步；需要设置时，请明确说“今天运动目标 20000 步”。" };
  }

  const explicitMutation = MUTATION_PATTERN.test(text);
  const pendingFollowUp = isPendingStepFollowUp(history) && PURE_STEP_VALUE_PATTERN.test(text);
  const steps = extractTargetSteps(text, explicitMutation || pendingFollowUp);

  if ((explicitMutation || pendingFollowUp) && steps !== null) {
    return { type: "set_steps", steps };
  }
  if (explicitMutation) {
    return { type: "ask_steps" };
  }

  return {
    type: "chat",
    reply: "我可以帮你设置今天的运动目标。请明确告诉我目标值，例如“今天运动目标 20000 步”。"
  };
}

function isPendingStepFollowUp(history: SportsChatMessage[]): boolean {
  const recent = history.slice(-4).reverse();
  const assistant = recent.find((message) => message.role === "assistant");
  if (assistant && PENDING_STEP_PATTERN.test(normalizeText(assistant.content))) return true;
  const user = recent.find((message) => message.role === "user");
  return Boolean(user && MUTATION_PATTERN.test(normalizeText(user.content)) && extractTargetSteps(user.content, true) === null);
}

function extractTargetSteps(text: string, allowBareNumber: boolean): number | null {
  const normalized = normalizeText(text);
  const candidates = [
    /([0-9][0-9,]*(?:\.[0-9]+)?\s*(?:万|w|k|千)?)\s*(?:步|steps?)/i,
    /([零〇一二两三四五六七八九十百千万]+)\s*步/,
    /(?:刷(?:步|到|成)?|改(?:成|到|为|一下)?|调到|设置(?:为|到)?|步数(?:改|调|设)(?:为|到)?|弄到|(?:来|搞)(?:个|到)?)\s*([0-9][0-9,]*(?:\.[0-9]+)?\s*(?:万|w|k|千)?|[零〇一二两三四五六七八九十百千万]+)/i
  ];
  if (allowBareNumber) {
    candidates.push(/^\s*([0-9][0-9,]*(?:\.[0-9]+)?\s*(?:万|w|k|千)?|[零〇一二两三四五六七八九十百千万]+)\s*(?:步)?\s*(?:吧|左右|就行|可以)?\s*$/i);
  }

  for (const pattern of candidates) {
    const raw = normalized.match(pattern)?.[1];
    if (!raw) continue;
    const value = parseStepNumber(raw);
    if (value !== null) return value;
  }
  return null;
}

function parseStepNumber(raw: string): number | null {
  const compact = raw.replace(/[\s,，]/g, "").toLowerCase();
  const arabic = compact.match(/^(\d+(?:\.\d+)?)(万|w|k|千)?$/i);
  if (arabic) {
    const multiplier = arabic[2] === "万" || arabic[2] === "w" ? 10_000 : arabic[2] === "k" || arabic[2] === "千" ? 1_000 : 1;
    const value = Math.round(Number(arabic[1]) * multiplier);
    return Number.isSafeInteger(value) ? value : null;
  }
  if (!/^[零〇一二两三四五六七八九十百千万]+$/.test(compact)) return null;
  return parseChineseInteger(compact);
}

function parseChineseInteger(text: string): number | null {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1_000, 万: 10_000 };
  let total = 0;
  let section = 0;
  let digit = 0;
  let lastLargeUnit = 0;
  for (const char of text) {
    if (char in digits) {
      digit = digits[char]!;
      continue;
    }
    const unit = units[char];
    if (!unit) return null;
    if (unit === 10_000) {
      section += digit;
      total += (section || 1) * unit;
      section = 0;
      digit = 0;
      lastLargeUnit = unit;
    } else {
      section += (digit || 1) * unit;
      digit = 0;
    }
  }
  if (lastLargeUnit === 10_000 && digit > 0 && section === 0) {
    return total + digit * 1_000;
  }
  return total + section + digit;
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ")
    .trim();
}

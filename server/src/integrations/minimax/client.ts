// MiniMax（OpenAI 兼容 chat 接口）：把促销文案识别成结构化线报草稿
import { fetchWithTimeout } from "../http.js";

export type ParsedDealStep = {
  content: string;
  copyType: "link" | "password" | null;
  copyValue: string;
};

export type ParsedDeal = {
  title: string;
  summary: string;
  steps: ParsedDealStep[];
};

export class MinimaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MinimaxError";
  }
}

export type MinimaxConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
};

export type DealAiParser = {
  parseDealFromText(rawText: string): Promise<ParsedDeal>;
};

const SYSTEM_PROMPT = `你是一个电商优惠「线报」编辑助手。用户会发来一段杂乱的促销文案（可能含 emoji、淘口令、链接、价格等）。
请把它整理成一条干净、用户能照着操作的线报，并严格只输出一个 JSON 对象，不要输出任何解释、不要用 markdown 代码块包裹。

JSON 结构：
{
  "title": "string，线报标题，简洁有吸引力，不超过 30 字",
  "summary": "string，一句话亮点说明，不超过 60 字，可为空字符串",
  "steps": [
    {
      "content": "string，这一步要用户做什么，口语化、清晰",
      "copyType": "link | password | null。这一步如果有链接填 link，有淘口令（￥...￥ 形式）填 password，没有可复制内容填 null",
      "copyValue": "string，需要用户复制的内容（链接或淘口令原文）；copyType 为 null 时填空字符串"
    }
  ]
}

规则：
- 把原文里的链接、淘口令原样提取到对应步骤的 copyValue，不要改写或编造链接。
- 如果原文本身就分了多个步骤（如「第一步…第二步…」「1. 2. 3.」），请按原顺序逐条保留为独立 step，不要合并、不要漏步骤。
- 每个含链接或口令的步骤，都要把对应的 copyValue 填上。
- steps 至少 1 个，最多 10 个。
- 不要编造原文没有的优惠信息或链接。
- 只返回 JSON。`;

export function createDealAiParser(
  config: MinimaxConfig,
  fetcher: typeof fetch = fetch
): DealAiParser {
  return {
    async parseDealFromText(rawText: string): Promise<ParsedDeal> {
      const text = (rawText ?? "").trim();
      if (!text) {
        throw new MinimaxError("请输入要识别的文案");
      }
      if (!config.apiKey) {
        throw new MinimaxError("MiniMax 未配置（缺少 MINIMAX_API_KEY）");
      }

      let response: Response;
      try {
        // AI 解析较慢，给 60s 超时（仍避免无限挂起）
        response = await fetchWithTimeout(
          fetcher,
          config.apiUrl,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
              model: config.model,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: text }
              ],
              temperature: 0.3,
              max_tokens: 2000
            })
          },
          60000
        );
      } catch (error) {
        throw new MinimaxError(`MiniMax 请求失败：${(error as Error).message}`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new MinimaxError(`MiniMax HTTP ${response.status}：${body.slice(0, 200)}`);
      }

      const payload = (await response.json().catch(() => null)) as
        | { choices?: Array<{ message?: { content?: string } }>; base_resp?: { status_code?: number; status_msg?: string } }
        | null;

      // MiniMax 业务错误：base_resp.status_code 非 0
      if (payload?.base_resp && payload.base_resp.status_code !== 0) {
        throw new MinimaxError(`MiniMax 返回错误：${payload.base_resp.status_msg ?? "未知"}`);
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new MinimaxError("MiniMax 未返回可用内容");
      }

      return normalizeParsedDeal(parseJsonLoose(content));
    }
  };
}

// 容错解析：去掉可能的 ```json 围栏，截取首个 { 到末个 }
function parseJsonLoose(content: string): unknown {
  let s = content.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    throw new MinimaxError("AI 返回的内容无法解析，请重试或手动填写");
  }
}

function normalizeParsedDeal(raw: unknown): ParsedDeal {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = String(obj.title ?? "").trim().slice(0, 100);
  const summary = String(obj.summary ?? "").trim().slice(0, 200);
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];

  const steps: ParsedDealStep[] = rawSteps
    .map((s): ParsedDealStep | null => {
      const step = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const content = String(step.content ?? "").trim();
      if (!content) return null;
      const copyValue = String(step.copyValue ?? "").trim();
      let copyType: "link" | "password" | null = null;
      if (step.copyType === "link" || step.copyType === "password") {
        copyType = step.copyType;
      } else if (copyValue) {
        copyType = /https?:\/\//i.test(copyValue) ? "link" : "password";
      }
      return { content, copyType: copyValue ? copyType : null, copyValue };
    })
    .filter((s): s is ParsedDealStep => s !== null)
    .slice(0, 30);

  if (steps.length === 0) {
    throw new MinimaxError("AI 没能识别出有效步骤，请检查文案或手动填写");
  }

  return { title: title || "优惠线报", summary, steps };
}

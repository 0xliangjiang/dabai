import type { SportsChatMessage } from "../../domain/sports-agent.js";
import { fetchWithTimeout } from "../http.js";
import { MinimaxError, type MinimaxConfig } from "./client.js";

const SPORTS_CHAT_SYSTEM_PROMPT = `你是一个友好、简洁的中文运动助手，只提供运动知识、训练计划、习惯培养和恢复建议。
当前运动账号服务已关闭，因此你不能绑定账号、修改步数、兑换会员或声称已经执行任何操作；遇到这类要求，要明确说明只能提供建议。
不要诊断疾病，不要替代医生；涉及疼痛、受伤或明显不适时，建议停止运动并咨询专业医生。
结合最近对话回答，控制在 160 字以内，不要使用 Markdown 表格。`;

export async function createSportsChatReply(
  config: MinimaxConfig,
  message: string,
  history: SportsChatMessage[],
  fetcher: typeof fetch = fetch
): Promise<string> {
  if (!config.apiKey) throw new MinimaxError("MiniMax 未配置（缺少 MINIMAX_API_KEY）");

  let response: Response;
  try {
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
            { role: "system", content: SPORTS_CHAT_SYSTEM_PROMPT },
            ...history.slice(-10),
            { role: "user", content: message }
          ],
          temperature: 0.6,
          max_tokens: 500
        })
      },
      45_000
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
  if (payload?.base_resp && payload.base_resp.status_code !== 0) {
    throw new MinimaxError(`MiniMax 返回错误：${payload.base_resp.status_msg ?? "未知"}`);
  }
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new MinimaxError("MiniMax 未返回可用内容");
  return content;
}

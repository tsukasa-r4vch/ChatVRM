import { Message } from "../messages/messages";

/**
 * 非ストリーム型：1回のレスポンスをまとめて受け取る
 */
export async function getChatResponse(messages: Message[], apiKey: string) {
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }
console.log("✅ 送信する messages:", messages);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://chat-vrm-bay.vercel.app", // ← ご自身のURLに変更
      "X-Title": "ChatVRM via OpenRouter",
    },
    body: JSON.stringify({
      model: "mistralai/mistral-7b-instruct:free", // 無料モデルを指定
      messages: messages,
      max_tokens: 200,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
console.log("Raw response text:", text);
  const json = await res.json();
  const message = json?.choices?.[0]?.message?.content || "エラーが発生しました";

  return { message };
}

/**
 * ストリーム型：文字をリアルタイムで受信
 */
export async function getChatResponseStream(
  messages: Message[],
  apiKey: string
) {
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://chat-vrm-bay.vercel.app", // ← ご自身のURLに変更
    "X-Title": "ChatVRM via OpenRouter",
  };

  console.log("✅ 送信する messages:", messages);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    headers: headers,
    method: "POST",
    body: JSON.stringify({
      model: "mistralai/mistral-7b-instruct:free",
      messages: messages,
      stream: true,
      max_tokens: 200,
    }),
  });

  if (res.status !== 200 || !res.body) {
    throw new Error(`Stream error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // 受け取ったバッファを改行で分割
          const lines = buffer.split("\n");
          // 最後の行は不完全な場合があるのでバッファに残す
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue; // 空行スキップ
            if (trimmed === "data: [DONE]") {
              controller.close();
              return;
            }
            if (trimmed.startsWith("data:")) {
              const jsonStr = trimmed.slice("data:".length).trim();
              if (!jsonStr) continue;
              try {
                const json = JSON.parse(jsonStr);
                const messagePiece = json.choices?.[0]?.delta?.content;
                if (messagePiece) {
                  controller.enqueue(messagePiece);
                }
              } catch (e) {
                console.error("JSON parse error:", e, "Raw:", jsonStr);
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return stream;
}

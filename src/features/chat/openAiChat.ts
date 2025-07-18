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
      model: "openchat/openchat-7b:free", // 無料モデルを指定
      messages: messages,
      max_tokens: 200,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

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
      model: "openchat/openchat-7b",
      messages: messages,
      stream: false,
      max_tokens: 200,
    }),
  });

  const reader = res.body?.getReader();
  if (res.status !== 200 || !reader) {
    throw new Error(`Stream error: ${res.status}`);
  }

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      const decoder = new TextDecoder("utf-8");
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const data = decoder.decode(value);
          const chunks = data
            .split("data:")
            .filter((val) => !!val && val.trim() !== "[DONE]");
          for (const chunk of chunks) {
            const json = JSON.parse(chunk);
            const messagePiece = json.choices?.[0]?.delta?.content;
            if (messagePiece) {
              controller.enqueue(messagePiece);
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

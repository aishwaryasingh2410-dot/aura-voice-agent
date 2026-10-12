const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

// Keep thinking disabled on Flash models to reduce voice-response latency.
export const thinkingConfig = MODEL.includes("2.5-flash") ? { thinkingBudget: 0 } : undefined;

export async function callGemini(body: any) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err: any = new Error("GEMINI_API_KEY is not set");
    err.code = "MISSING_KEY";
    throw err;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

import { NextResponse } from "next/server";
import { callGemini, thinkingConfig } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { TOOL_DECLARATIONS, normalizeOrderId, runTool } from "@/lib/orders";

export const maxDuration = 30;

const FALLBACK = "Sorry, I didn't quite catch that. Could you please say it again?";

// Stateless: the client sends the whole conversation (including earlier tool calls)
// and gets the updated conversation back. The server runs the tool-calling loop.
export async function POST(req: Request) {
  try {
    const { contents } = await req.json();
    if (!Array.isArray(contents) || contents.length === 0) {
      return NextResponse.json({ error: "contents required" }, { status: 400 });
    }

    const convo: any[] = [...contents];
    const toolCalls: { name: string; args: any; result: any }[] = [];
    const latestUserText = [...contents].reverse().find((entry: any) => entry.role === "user" && entry.parts?.some((part: any) => part.text))?.parts
      ?.map((part: any) => part.text || "").join(" ") ?? "";
    const mentionsOrderIntent = /\b(order|ord|track(?:ing)?|cancel|return|refund|deliver(?:y|ed)?|status)\b/i.test(latestUserText);
    const orderIdMatch = latestUserText.match(/\b(?:ord(?:er)?[\s-]*)?\d{2,}\b/i);
    const explicitOrderId = mentionsOrderIntent && orderIdMatch ? normalizeOrderId(orderIdMatch[0]) : null;
    // Resolve explicit order requests locally to skip Gemini's separate tool-selection turn.
    const verifiedOrder = explicitOrderId
      ? { args: { order_id: explicitOrderId }, result: runTool("get_order_details", { order_id: explicitOrderId }) }
      : null;

    if (verifiedOrder) {
      toolCalls.push({ name: "get_order_details", ...verifiedOrder });
    }

    for (let i = 0; i < 4; i++) {
      const data = await callGemini({
        systemInstruction: {
          parts: [{
            text: verifiedOrder
              ? `${SYSTEM_PROMPT}\n\nA verified order lookup has already been performed for this turn. Use this result directly; do not request another lookup: ${JSON.stringify(verifiedOrder.result)}`
              : SYSTEM_PROMPT,
          }],
        },
        contents: convo,
        ...(!verifiedOrder ? { tools: [{ functionDeclarations: TOOL_DECLARATIONS }] } : {}),
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 300,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });

      const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);

      if (calls.length === 0) {
        const text = parts.map((p) => p.text || "").join("").trim() || FALLBACK;
        convo.push({ role: "model", parts: [{ text }] });
        return NextResponse.json({ reply: text, contents: convo, toolCalls });
      }

      convo.push({ role: "model", parts });
      const responses = calls.map((c) => {
        const result = runTool(c.functionCall.name, c.functionCall.args);
        toolCalls.push({ name: c.functionCall.name, args: c.functionCall.args, result });
        return { functionResponse: { name: c.functionCall.name, response: result } };
      });
      convo.push({ role: "user", parts: responses });
    }

    const text = "Sorry, I'm having trouble with that right now. Could you try again?";
    convo.push({ role: "model", parts: [{ text }] });
    return NextResponse.json({ reply: text, contents: convo, toolCalls });
  } catch (e: any) {
    console.error(e);
    let reply = "Sorry, I'm having a technical problem. Could you please repeat that?";
    if (e?.code === "MISSING_KEY") reply = "The server is missing its API key. Please check the setup.";
    else if (e?.status === 429) reply = "I'm a little busy right now. Please try again in a moment.";
    return NextResponse.json({ error: String(e?.message || e), reply }, { status: 200 });
  }
}

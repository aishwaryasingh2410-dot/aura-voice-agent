import { NextResponse } from "next/server";
import { callGemini, thinkingConfig } from "@/lib/gemini";

export const maxDuration = 30;

const INTENTS = [
  "ORDER_TRACKING",
  "ORDER_CANCELLATION",
  "RETURN_REFUND",
  "SHIPPING_INFO",
  "PAYMENT_COD_INFO",
  "PRODUCT_INFO",
  "OUT_OF_SCOPE",
  "OTHER",
];
const STATUSES = ["RESOLVED", "PARTIALLY_RESOLVED", "UNRESOLVED", "POLICY_DECLINED", "ESCALATED_TO_TEAM"];

function fallback(transcript: any[], toolCalls: any[]) {
  const found = toolCalls.find((t) => t.result?.found);
  const customerTurns = transcript.filter((m) => m.role === "customer").length;
  return {
    customer_intent: customerTurns === 0 ? "OTHER" : "OTHER",
    order_id: found?.result?.order_id ?? null,
    resolution_status: customerTurns === 0 ? "UNRESOLVED" : "PARTIALLY_RESOLVED",
    call_summary: "Automatic summary unavailable; see transcript.",
  };
}

export async function POST(req: Request) {
  const { transcript = [], toolCalls = [] } = await req.json();

  if (!transcript.some((m: any) => m.role === "customer")) {
    return NextResponse.json({
      customer_intent: "OTHER",
      order_id: null,
      resolution_status: "UNRESOLVED",
      call_summary: "The customer did not say anything during the call.",
    });
  }

  const text = transcript.map((m: any) => `${m.role === "agent" ? "Aria" : "Customer"}: ${m.text}`).join("\n");
  const orderIds = [...new Set(toolCalls.filter((t: any) => t.result?.found).map((t: any) => t.result.order_id))];

  try {
    const data = await callGemini({
      systemInstruction: {
        parts: [
          {
            text:
              "You summarise customer support calls for Aura Skincare. Return JSON only. " +
              "customer_intent is the customer's MAIN goal. order_id is the order discussed (null if none or never found). " +
              "resolution_status: RESOLVED = customer got what they needed; POLICY_DECLINED = request refused because it is outside policy; " +
              "ESCALATED_TO_TEAM = agent noted the request for the support team; PARTIALLY_RESOLVED / UNRESOLVED otherwise. " +
              "call_summary is 1-2 factual sentences covering what was asked and what the agent told the customer.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Orders successfully looked up during the call: ${JSON.stringify(orderIds)}\n\nTranscript:\n${text}` }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            customer_intent: { type: "STRING", enum: INTENTS },
            order_id: { type: "STRING", nullable: true },
            resolution_status: { type: "STRING", enum: STATUSES },
            call_summary: { type: "STRING" },
          },
          required: ["customer_intent", "order_id", "resolution_status", "call_summary"],
        },
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });
    const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ?? "";
    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    return NextResponse.json(fallback(transcript, toolCalls));
  }
}

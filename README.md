# Aria – AI Voice Support Agent for Aura Skincare

A browser-based voice customer-support agent. Click **Start Call**, talk to Aria, hear her reply, and get a transcript plus a structured JSON outcome when you end the call. No telephony needed.

## Features

- Natural voice conversation in the browser (en-IN speech recognition and an Indian-English voice where the OS provides one)
- Live state indicator: Listening / Thinking / Speaking
- Tool calling: `get_order_details(order_id)` against a mock order DB, including invalid, missing and ineligible cases
- Brand guardrails: policy enforcement, out-of-scope refusal, no invented facts, unclear-audio handling
- Hinglish replies when the customer uses Hinglish
- "Interrupt Aria" button and a typed-input fallback if the mic is unavailable
- Post-call transcript and structured JSON summary
- Test Orders panel on the page (ORD-101, ORD-102, ORD-103) with example prompts

## Architecture

```
Browser (Next.js client)                     Next.js API routes (Vercel)
┌──────────────────────────┐   text    ┌─────────────────────────────────────┐
│ Web Speech API  (STT)    │──────────▶│ /api/chat                           │
│ Web Speech API  (TTS)    │◀──────────│   Gemini 2.5 Flash + system prompt  │
│ State machine + UI       │   reply   │   ⇄ tool loop: get_order_details()  │
│ Holds conversation state │           │ /api/summary                        │
└──────────────────────────┘           │   Gemini JSON-mode call-outcome     │
                                       └─────────────────────────────────────┘
```

- **Pipeline:** STT → LLM with function calling → TTS. Speech runs in the browser, so there is no extra vendor, key or cost for voice.
- **Stateless server:** the client sends the full conversation (including earlier tool calls) on every turn. The server runs the tool loop (max 4 steps) and returns the updated conversation.
- **Policy lives in two places:** the system prompt holds the brand rules and tone. Eligibility (can this order be cancelled or returned?) is computed in code in `lib/orders.ts` and returned by the tool, so the LLM only communicates the decision instead of deciding it.
- **Order IDs from speech:** `normalizeOrderId` turns "ord 101", "O R D one zero one" and "101" into `ORD-101`.
- **Summary:** a separate JSON-schema-constrained Gemini call produces `customer_intent`, `order_id`, `resolution_status`, `call_summary`.

## Setup

```bash
npm install
cp .env.example .env.local     # add GEMINI_API_KEY (free key: https://aistudio.google.com/apikey)
npm run dev                    # http://localhost:3000
npm run test:tools             # unit checks for the order tool (Node 22.6+)
```

Use desktop Chrome or Edge (best Web Speech API support) and allow the microphone. Headphones avoid the agent hearing itself.

## Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel, add the `GEMINI_API_KEY` environment variable, deploy.
3. Open the public URL, allow the mic, and test.

## Section 9 – How I think

**1. Why this architecture and stack?**
I chose Next.js and TypeScript because they let me build the voice interface and the API routes in one small, deployable application. The browser handles speech recognition and playback, while Gemini handles conversation and structured summaries. That keeps the prototype simple and avoids adding a separate voice vendor or telephony integration. I also kept order lookups and eligibility rules in deterministic code rather than asking the model to make policy decisions. The trade-off is that browser speech support and voice quality vary by device.

**2. Most difficult part and how I solved it.**
The hardest part was coordinating speech recognition, model responses and speech playback without losing track of the conversation. Recognition can stop after silence, and playback can interfere with listening. I handled this with explicit listening/thinking/speaking states, sentence-by-sentence playback, and recognition restart behavior. I also made spoken order IDs more reliable by normalizing common speech-to-text variations, and kept cancellation and return eligibility in the order tool so those decisions are not left to the model.

**3. One more week: what first?**
I would first improve the live voice experience: streaming speech input and output, with reliable barge-in so the customer can interrupt Aria naturally. The current browser-based approach is convenient for a prototype, but latency, interruption handling and voice quality have a large effect on whether a support conversation feels usable. I would validate the change with real users across supported browsers before replacing the current flow.

**4. At 1,000 conversations a day?**
I would replace the in-memory mock orders with authenticated access to the real order system, and persist transcripts and outcomes with clear retention and deletion rules. Before exposing order details, I would verify the customer; I would also add rate limits, provider quotas, timeouts and retries, plus a human handoff for unresolved or sensitive cases. Operationally, I would monitor latency, errors, tool failures and resolution rates, and regularly evaluate conversations for policy compliance. I would address consent, PII redaction and access controls from the start, and use those measurements to guide capacity and cost optimizations rather than scaling speculatively.

## Project layout

```
app/page.tsx              voice UI, state machine, STT/TTS
app/api/chat/route.ts     LLM + tool-calling loop
app/api/summary/route.ts  post-call JSON outcome
lib/orders.ts             mock DB, get_order_details, eligibility, ID normaliser
lib/prompt.ts             Aria persona, policies and guardrails
lib/gemini.ts             Gemini REST helper
scripts/test-tools.ts     order tool checks
```

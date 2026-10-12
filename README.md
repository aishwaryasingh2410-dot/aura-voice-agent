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

> Draft answers to personalise before submitting. They will ask you about these in the review, so rewrite them in your own words and make sure you can explain each point.

**1. Why this architecture and stack?**
I used a modular pipeline (browser STT → LLM with tool calling → browser TTS) on Next.js/Vercel. It is the quickest route to a public, testable URL with no telephony, and browser speech needs no extra vendor or credits. A modular pipeline also lets me see and control each stage: the transcript is text, so tool calls, guardrails and the post-call summary are easy to reason about and log. Gemini Flash gives fast responses and function calling on a free tier. I kept the server stateless, and I computed policy eligibility in code so the model communicates decisions rather than inventing them.

**2. Most difficult part and how I solved it.**
Making the conversation feel natural while staying in control. Browser TTS stops long utterances, speech recognition ends on silence, and the agent must not hear itself. I solved this with an explicit state machine (listening → thinking → speaking), sentence-by-sentence TTS, auto-restarting recognition on silence, and a short-reply voice prompt. For correctness, I put eligibility rules in the tool result instead of the prompt, and handled spoken order IDs ("ord one zero one") with a normaliser.

**3. One more week: what first?**
Real barge-in (stop speaking when the customer talks) with echo cancellation, and moving to streaming STT/TTS (for example Deepgram + a neural Indian-voice TTS) to cut latency and improve voice quality and accent handling. Latency and interruption handling are what most shape whether a voice agent feels human.

**4. At 1,000 conversations a day?**
Persistent storage for calls, transcripts and outcomes; authentication on the order tool (verify the caller, e.g. via phone/OTP, before sharing order data); a real order system instead of the mock DB; rate limiting, retries and fallbacks across LLM providers; streaming for latency; monitoring (latency, tool-failure rate, resolution rate); evaluation sets for policy compliance; human handoff for angry or unresolved callers; PII redaction and consent for recording; and cost controls (caching, shorter prompts, smaller models).

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

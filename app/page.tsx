"use client";

import { useEffect, useRef, useState } from "react";
import { GREETING } from "@/lib/prompt";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "ended";
type Msg = { id: number; role: "customer" | "agent" | "tool"; text: string; time: string };

const SAMPLE_ORDERS = [
  { id: "ORD-101", customer: "Priya Sharma", product: "Vitamin C Serum (30ml)", value: "₹699", status: "Out for Delivery", notes: "BlueDart BD-982103. Expected by 6 PM today" },
  { id: "ORD-102", customer: "Rahul Verma", product: "Hydrating Sunscreen SPF 50", value: "₹499", status: "Delivered", notes: "Delhivery DL-441029. Delivered 14 days ago" },
  { id: "ORD-103", customer: "Ananya Patel", product: "Green Tea Face Wash + Toner", value: "₹850", status: "Processing", notes: "Ordered 3 hours ago. Eligible for cancellation" },
  { id: "ORD-104", customer: "Meera Iyer", product: "Barrier Repair Moisturizer (50ml)", value: "₹799", status: "Delivered", notes: "Delhivery DL-771204. Delivered 3 days ago" },
  { id: "ORD-105", customer: "Kabir Nair", product: "Aloe Gel Cleanser (150ml)", value: "₹349", status: "Shipped", notes: "BlueDart BD-550981. Expected in 2 days" },
];

const LABEL: Record<Phase, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  ended: "Call ended",
};

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Page() {
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [log, setLog] = useState<Msg[]>([]);
  const [interim, setInterim] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [summarising, setSummarising] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [srSupported, setSrSupported] = useState(true);

  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const contentsRef = useRef<any[]>([]);
  const logRef = useRef<Msg[]>([]);
  const toolLogRef = useRef<any[]>([]);
  const recRef = useRef<any>(null);
  const speakTokenRef = useRef(0);
  const idRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  useEffect(() => {
    const w = window as any;
    setSrSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    // Some browsers load voices lazily
    window.speechSynthesis?.getVoices();
    return () => {
      activeRef.current = false;
      window.speechSynthesis?.cancel();
      try { recRef.current?.abort(); } catch {}
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, interim]);

  const addMsg = (role: Msg["role"], text: string) => {
    const m: Msg = { id: ++idRef.current, role, text, time: now() };
    logRef.current = [...logRef.current, m];
    setLog(logRef.current);
  };

  // ---------- Text to speech ----------
  function pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices();
    const indian = voices.filter((v) => v.lang === "en-IN" || v.lang === "en_IN");
    const female = indian.find((v) => /female|heera|neerja|veena|isha|aditi|raveena|google/i.test(v.name));
    return female || indian[0] || voices.find((v) => v.lang.startsWith("hi")) || voices.find((v) => v.lang.startsWith("en"));
  }

  function speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const token = ++speakTokenRef.current;
      synth.cancel();
      // Chrome silently stops long utterances, so speak sentence by sentence
      const chunks = text.match(/[^.!?।]+[.!?।]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
      let i = 0;
      const next = () => {
        if (token !== speakTokenRef.current || i >= chunks.length) return resolve();
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        const v = pickVoice();
        if (v) u.voice = v;
        u.lang = v?.lang || "en-IN";
        u.rate = 1.03;
        u.onend = next;
        u.onerror = () => resolve();
        synth.speak(u);
      };
      next();
    });
  }

  function stopSpeaking() {
    speakTokenRef.current++;
    window.speechSynthesis?.cancel();
  }

  // ---------- Speech to text ----------
  function listen() {
    if (!activeRef.current) return;
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setPhase("listening"); // typed fallback only
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    let stopped = false;
    (rec as any)._stop = () => { stopped = true; };

    rec.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    rec.onerror = (e: any) => {
      if (e.error && e.error !== "no-speech" && e.error !== "aborted") setError(`Speech recognition error: ${e.error}`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow the mic in your browser's address bar, or type below.");
        stopped = true;
      }
    };
    rec.onend = () => {
      setInterim("");
      if (stopped || !activeRef.current || phaseRef.current !== "listening") return;
      const t = finalText.trim();
      if (t) send(t);
      else setTimeout(() => activeRef.current && phaseRef.current === "listening" && listen(), 250); // silence: keep listening
    };

    recRef.current = rec;
    setPhase("listening");
    try { rec.start(); } catch { /* already started */ }
  }

  function stopListening() {
    const rec = recRef.current;
    if (rec) {
      try { rec._stop?.(); rec.abort(); } catch {}
      recRef.current = null;
    }
    setInterim("");
  }

  // ---------- Conversation ----------
  async function send(text: string) {
    if (!activeRef.current || !text.trim()) return;
    stopListening();
    stopSpeaking();
    addMsg("customer", text);
    setPhase("thinking");
    setError("");

    const contents = [...contentsRef.current, { role: "user", parts: [{ text }] }];
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });
      const data = await res.json();
      if (!activeRef.current) return; // call ended while waiting
      if (data.error) console.warn(data.error);
      if (data.contents) contentsRef.current = data.contents;
      else contentsRef.current = [...contents, { role: "model", parts: [{ text: data.reply }] }];

      for (const t of data.toolCalls ?? []) {
        toolLogRef.current.push(t);
        addMsg("tool", `Tool call: ${t.name}(${JSON.stringify(t.args)}) → ${t.result?.found ? "found " + t.result.order_id : t.result?.error}`);
      }
      addMsg("agent", data.reply);
      setPhase("speaking");
      await speak(data.reply);
    } catch (e) {
      const reply = "Sorry, I lost the connection for a moment. Could you say that again?";
      addMsg("agent", reply);
      setPhase("speaking");
      await speak(reply);
    }
    if (activeRef.current) listen();
  }

  async function startCall() {
    setError("");
    setSummary(null);
    logRef.current = [];
    setLog([]);
    toolLogRef.current = [];
    contentsRef.current = [
      { role: "user", parts: [{ text: "(Call connected)" }] },
      { role: "model", parts: [{ text: GREETING }] },
    ];
    activeRef.current = true;
    addMsg("agent", GREETING);
    setPhase("speaking");
    await speak(GREETING);
    if (activeRef.current) listen();
  }

  async function endCall() {
    activeRef.current = false;
    stopListening();
    stopSpeaking();
    setPhase("ended");
    setSummarising(true);
    const transcript = logRef.current
      .filter((m) => m.role !== "tool")
      .map((m) => ({ role: m.role, text: m.text, time: m.time }));
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, toolCalls: toolLogRef.current }),
      });
      setSummary(await res.json());
    } catch {
      setSummary({ error: "Could not generate summary" });
    }
    setSummarising(false);
  }

  function interrupt() {
    stopSpeaking();
    if (activeRef.current) listen();
  }

  const inCall = phase !== "idle" && phase !== "ended";
  const transcriptOnly = log.filter((m) => m.role !== "tool");

  return (
    <div className="wrap">
      <header>
        <p className="eyebrow"><span className="eyebrow-mark" />AURA SKINCARE / CUSTOMER CARE</p>
        <h1>Aria · Aura Skincare Voice Support</h1>
        <p>Click <b>Start Call</b>, allow the microphone, and talk to Aria. Best in desktop Chrome or Edge, with headphones to avoid echo.</p>
      </header>

      <div className="grid">
        <div>
          <div className="card">
            <h2>Call</h2>
            <div className="controls">
              <button onClick={startCall} disabled={inCall}>Start Call</button>
              <button className="end" onClick={endCall} disabled={!inCall}>End Call</button>
              <button className="ghost" onClick={interrupt} disabled={phase !== "speaking"}>Interrupt Aria</button>
              <span className={`state ${phase}`}><span className="dot" />{LABEL[phase]}</span>
            </div>
            {!srSupported && (
              <p className="err">This browser has no speech recognition. Use Chrome/Edge, or type your messages below. Aria will still speak.</p>
            )}
            {error && <p className="err">{error}</p>}
            {inCall && (
              <form
                className="typed"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = typed;
                  setTyped("");
                  send(t);
                }}
              >
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Mic not working? Type here instead…" />
                <button type="submit" disabled={phase === "thinking"}>Send</button>
              </form>
            )}
          </div>

          <div className="card">
            <h2>Live conversation</h2>
            <div className="log">
              {log.length === 0 && <span className="empty">The conversation will appear here.</span>}
              {log.map((m) =>
                m.role === "tool" ? (
                  <div key={m.id} className="tool">⚙ {m.text}</div>
                ) : (
                  <div key={m.id} className={`msg ${m.role}`}>
                    <small>{m.role === "agent" ? "Aria" : "You"} · {m.time}</small>
                    {m.text}
                  </div>
                )
              )}
              {interim && <div className="msg customer interim">{interim}</div>}
              <div ref={logEndRef} />
            </div>
          </div>

        </div>

        <div>
          <div className="card">
            <h2>Test orders <span className="section-count">{SAMPLE_ORDERS.length}</span></h2>
            <div className="table-scroll">
            <table className="orders-table">
              <thead>
                <tr><th>ID</th><th>Product</th><th>Status</th></tr>
              </thead>
              <tbody>
                {SAMPLE_ORDERS.map((o) => (
                  <tr key={o.id}>
                    <td><code>{o.id}</code></td>
                    <td>{o.product}<br /><span className="order-meta">{o.customer} · {o.value}<br />{o.notes}</span></td>
                    <td><span className={`status-pill ${o.status.toLowerCase().replaceAll(" ", "-")}`}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <div className="card">
            <h2>Things to try</h2>
            <ul className="try">
              <li>“Where is my order ORD-101?”</li>
              <li>“I want to cancel ORD-103.”</li>
              <li>“ORD-102 was delivered two weeks ago and I opened it. Can I return it?”</li>
              <li>“Can I cancel ORD-101?” (already out for delivery)</li>
              <li>“Where is order ORD-999?” (does not exist)</li>
              <li>“Is there a shipping fee on a 300 rupee order?”</li>
              <li>“Can you book me a flight to Goa?”</li>
              <li>“Mera order kahan hai?” (Hinglish, no ID given)</li>
              <li>“Can I return ORD-104? It was delivered three days ago.”</li>
              <li>“Where is ORD-105, and can I cancel it?”</li>
            </ul>
            <p className="hint">Order IDs can be said as “ORD 101” or “O R D one zero one”.</p>
          </div>
        </div>
      </div>

      {phase === "ended" && (
        <section className="card post-call-report">
          <h2>Post-call report</h2>
          <div className="report-grid">
            <div className="report-transcript">
              <h3>Transcript</h3>
              {transcriptOnly.length === 0 ? (
                <p className="empty">No transcript.</p>
              ) : (
                <table>
                  <tbody>
                    {transcriptOnly.map((m) => (
                      <tr key={m.id}>
                        <td className="transcript-time">{m.time}</td>
                        <td className="transcript-role">{m.role === "agent" ? "Aria" : "Customer"}</td>
                        <td>{m.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="report-outcome">
              <h3>Structured call outcome</h3>
              {summarising ? <p className="empty">Generating summary…</p> : <pre>{JSON.stringify(summary, null, 2)}</pre>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

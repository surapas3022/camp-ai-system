"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { Citation, Language, RetrievalMode, SafeAnswerStatus } from "../lib/rag";
import type { CorpusManifest } from "../lib/corpus/types";
import { SessionControl } from "./session-control";
import { inspectQuestion, isPiiReason } from "../lib/guardrails";

type AnswerState = { status: SafeAnswerStatus | null; answer: string; citations: Citation[]; error: string | null };

const copy = {
  en: {
    eyebrow: "AIAT × CAMT · Lab 2", title: "Secure RAG fast-start", subtitle: "A working cited RAG with server-enforced access.",
    warning: "Access is enforced by the server. Public sessions see public material only; staff material requires a valid staff session.",
    effective: "Effective access", resolved: "Resolved server-side from the signed session", safe: "Safe-response status", baseline: "Ready to retrieve",
    prompt: "Ask the seeded synthetic knowledge base…", ask: "Ask", asking: "Searching…", retrieval: "Retrieval strategy", keyword: "Keyword / FTS5", semantic: "Semantic / local E5", hint: "Keyword uses SQLite FTS5. Semantic mode embeds the query locally and searches SQLite-vec.",
    example: "Try: What should learners do when using GenAI?", sources: "Page-level sources", page: "Page", pages: "Pages", classification: "Classification", open: "Inspect source PDF", grounded: "Grounded", ambiguous: "Needs clarification", not_found: "Not found", refused: "Refused", unsafe_output: "Unsafe output",
    empty: "Ask a question to retrieve the seeded corpus.", error: "Could not generate an answer.", docs: "accessible documents", ledger: "Knowledge base", security: "Lab 2 security backlog", agent: "Agent workspace", system: "System readiness", scope: "Scope: local synthetic corpus · only authorized excerpts go to the configured NVIDIA Build API.", session: { access: "Access", public: "Public", staff: "Staff", enable: "Enable staff", pin: "Staff PIN", cancel: "Cancel", logout: "Log out", submitting: "Checking…", unavailable: "Staff access is unavailable." },
  },
  th: {
    eyebrow: "AIAT × CAMT · Lab 2", title: "จุดเริ่มต้น Secure RAG", subtitle: "RAG พร้อม citation และ server-enforced access.",
    warning: "ระบบบังคับใช้สิทธิ์จากฝั่งเซิร์ฟเวอร์ ผู้ใช้ public เห็นเฉพาะข้อมูล public และข้อมูล staff ต้องใช้ staff session ที่ถูกต้อง.",
    effective: "สิทธิ์ที่มีผล", resolved: "เซิร์ฟเวอร์ resolve จาก signed session", safe: "สถานะคำตอบปลอดภัย", baseline: "พร้อมค้นคืนข้อมูล",
    prompt: "ถามคลังความรู้สังเคราะห์ที่เตรียมไว้…", ask: "ถาม", asking: "กำลังค้น…", retrieval: "กลยุทธ์การค้นคืนข้อมูล", keyword: "คำสำคัญ / FTS5", semantic: "ความหมาย / E5 ในเครื่อง", hint: "Keyword ใช้ SQLite FTS5 ส่วน semantic ฝัง query ในเครื่องและค้น SQLite-vec.",
    example: "ลองถาม: ผู้เรียนควรทำอย่างไรเมื่อใช้ GenAI?", sources: "แหล่งอ้างอิงตามหน้า", page: "หน้า", pages: "หน้า", classification: "ชั้นข้อมูล", open: "ดู PDF ต้นฉบับ", grounded: "มีหลักฐาน", ambiguous: "ต้องการคำถามที่ชัดเจนขึ้น", not_found: "ไม่พบ", refused: "ปฏิเสธ", unsafe_output: "ผลลัพธ์ไม่ปลอดภัย",
    empty: "ถามคำถามเพื่อค้นใน corpus ที่เตรียมไว้.", error: "ไม่สามารถสร้างคำตอบได้", docs: "เอกสารที่เข้าถึงได้", ledger: "คลังความรู้", security: "รายการความปลอดภัย Lab 2", agent: "พื้นที่ทำงานเอเจนต์", system: "ความพร้อมของระบบ", scope: "ขอบเขต: corpus สังเคราะห์ในเครื่อง · ส่งเฉพาะ excerpt ที่ได้รับสิทธิ์ไปยัง NVIDIA Build.", session: { access: "สิทธิ์", public: "สาธารณะ", staff: "เจ้าหน้าที่", enable: "เปิดใช้ staff", pin: "Staff PIN", cancel: "ยกเลิก", logout: "ออกจากระบบ", submitting: "กำลังตรวจสอบ…", unavailable: "ไม่สามารถเปิดใช้ staff ได้" },
  },
} as const;

function readSse(stream: ReadableStream<Uint8Array>, onEvent: (event: string, data: unknown) => void) {
  return (async () => {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += value;
        const records = pending.split(/\r?\n\r?\n/u);
        pending = records.pop() ?? "";
        for (const record of records) {
          const event = /^event:\s*(.+)$/mu.exec(record)?.[1];
          const raw = /^data:\s*(.+)$/mu.exec(record)?.[1];
          if (event && raw) onEvent(event, JSON.parse(raw));
        }
      }
    } finally { reader.releaseLock(); }
  })();
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<RetrievalMode>("semantic");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnswerState | null>(null);
  const [corpus, setCorpus] = useState<CorpusManifest | null>(null);
  const text = copy[language];

  async function refreshCorpus() {
    const response = await fetch("/api/knowledge/documents", { cache: "no-store" });
    const data = response.ok ? await response.json() as { corpus?: CorpusManifest } : null;
    setCorpus(data?.corpus ?? null);
  }
  useEffect(() => { void refreshCorpus().catch(() => undefined); }, []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    const localMatch = inspectQuestion(question);
    setBusy(true);
    if (localMatch) {
      const answer = language === "th"
        ? (isPiiReason(localMatch.reason) ? "เพื่อความเป็นส่วนตัว โปรดลบข้อมูลส่วนบุคคลหรือข้อมูลลับออกก่อนถามใหม่" : "ไม่สามารถดำเนินการตามคำขอที่พยายามหลีกเลี่ยงการป้องกันของระบบได้")
        : (isPiiReason(localMatch.reason) ? "For privacy, remove personal or secret information before asking again." : "I can’t help with requests that try to bypass this system’s safeguards.");
      setResult({ status: "refused", answer, citations: [], error: null });
    } else setResult({ status: null, answer: "", citations: [], error: null });
    try {
      const response = await fetch("/api/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, mode, language }) });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? text.error);
      await readSse(response.body, (eventName, data) => {
        if (eventName === "status") setResult((current) => current ? { ...current, status: data as SafeAnswerStatus } : current);
        if (eventName === "token") setResult((current) => current ? { ...current, answer: current.answer + String(data) } : current);
        if (eventName === "final") { const final = data as AnswerState; setResult({ ...final, error: null }); }
        if (eventName === "error") throw new Error(String(data));
      });
    } catch (error) { setResult((current) => ({ status: current?.status ?? null, answer: current?.answer ?? "", citations: [], error: error instanceof Error ? error.message : text.error })); }
    finally { setBusy(false); }
  }

  return <main className="lab">
    <header className="hero"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="subtitle">{text.subtitle}</p></div><div className="header-actions"><nav><a href="/knowledge">{text.ledger}</a><a href="/security">{text.security}</a><a href="/agent">{text.agent}</a><a href="/system">{text.system}</a></nav><SessionControl labels={text.session} onRoleChange={() => void refreshCorpus()} /><div className="language" aria-label="Language"><button className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "th" ? "selected" : ""} onClick={() => setLanguage("th")}>ไทย</button></div></div></header>
    <p className="warning" role="alert">{text.warning}</p>
    <section className="state-strip"><div><span>{text.effective}</span><strong>{text.resolved}</strong></div><div><span>{text.safe}</span><strong>{result?.status ? text[result.status] : text.baseline}</strong></div><div><span>Seed corpus</span><strong>{corpus ? `${corpus.documentCount} ${text.docs} · ${corpus.chunkCount} chunks` : "Loading…"}</strong></div></section>
    <section className="chat-card"><section className="system-map"><div><p className="eyebrow">Baseline flow</p><strong>Seeded PDFs</strong><span>public + staff labels</span></div><div><strong>FTS5</strong><span>keyword retrieval</span></div><div><strong>SQLite-vec</strong><span>local E5 query vector</span></div><div><strong>NVIDIA Build</strong><span>cited answer</span></div></section><form onSubmit={ask}><label htmlFor="question">{text.example}</label><fieldset className="retrieval-mode"><legend>{text.retrieval}</legend><label><input type="radio" checked={mode === "keyword"} onChange={() => setMode("keyword")} disabled={busy} /> {text.keyword}</label><label><input type="radio" checked={mode === "semantic"} onChange={() => setMode("semantic")} disabled={busy} /> {text.semantic}</label></fieldset><div className="question-row"><input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={text.prompt} disabled={busy} /><button type="submit" disabled={busy}>{busy ? text.asking : text.ask}</button></div></form><p className="retrieval-hint">{text.hint}</p>
      {!result ? <p className="empty">{text.empty}</p> : <article className="answer" aria-live="polite">{result.status ? <span className={`status ${result.status}`}>{text[result.status]}</span> : null}{result.answer ? <p>{result.answer}</p> : null}{result.error ? <p className="error-message">{result.error}</p> : null}{result.citations.length ? <div className="citations"><h2>{text.sources}</h2>{result.citations.map((citation) => <a className="citation" href={`/api/knowledge/documents/${citation.documentId}/file#page=${citation.pageStart}`} target="_blank" rel="noreferrer" key={citation.chunkId}><strong>[{citation.number}] {citation.documentName}</strong><span>{citation.excerpt}</span><small>{citation.pageStart === citation.pageEnd ? `${text.page} ${citation.pageStart}` : `${text.pages} ${citation.pageStart}–${citation.pageEnd}`} · {text.classification}: <b>{citation.accessLevel}</b> · {text.open}</small></a>)}</div> : null}</article>}
    </section><footer>{text.scope}</footer>
  </main>;
}

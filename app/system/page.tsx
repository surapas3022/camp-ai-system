"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { EvaluationDashboard, EvaluationGateGroup, EvaluationMode, EvaluationRun, FeedbackKind, FeedbackRating, UserRole } from "../../lib/contracts";
import { RELEASE_GATE_GROUPS } from "../../lib/contracts";
import { SessionControl } from "../session-control";

type Language = "en" | "th";
const FEEDBACK_REASONS = ["inaccurate", "unhelpful", "good_quality", "unsafe_output", "missed_refusal", "privacy_concern"] as const;

const copy = {
  en: {
    eyebrow: "AIAT x CAMT · Lab 4",
    title: "Release criteria dashboard",
    subtitle: "Run the evaluation suite, inspect bounded metrics, and see whether the automatic release gate passes.",
    chat: "RAG chat", knowledge: "Knowledge base", security: "Security workbench", agent: "Agent workspace", system: "System readiness",
    warning: "This page is a Lab 4 release-criteria console. It does not deploy, auto-release, or send telemetry to a vendor. Evaluation records and feedback stay privacy-minimised.",
    status: {
      agent: ["Agent v3 workflow", "Working · three tools and a human approval gate"],
      gate: "Release gate",
      deployment: ["Public deployment", "Not required for this course"],
      notRun: "No evaluation run yet",
      pass: "Pass",
      fail: "Fail",
    },
    inheritedLabel: "Inherited from earlier labs",
    inherited: "What already works",
    inheritedControls: [
      "RAG chat with grounded, page-level citations.",
      "Server-enforced access resolved from the signed staff session.",
      "Input, retrieval, and output controls: injection and PII refusal, role-aware access, poisoned-source quarantine, and citation validation.",
      "Bounded agent workflow with three allowlisted tools and a fixed step budget.",
      "Version-bound, one-time human approval before a local simulated result.",
      "Privacy-minimised audit records and task traces that hold fingerprints, counts, and reason codes only.",
    ],
    build: "Build in Lab 4",
    pending: "Pending",
    done: "Done",
    backlog: [
      ["Evaluation dataset and expected outcomes", "Define a small, versioned set of supported, ambiguous, unsafe, no-evidence, and approval scenarios with expected behaviour."],
      ["Evaluation runner", "Execute deterministic cases against a chosen provider or fixture mode and retain only bounded evaluation results."],
      ["Quality and evidence metrics", "Record answer and task quality notes, citation support, safe-stop behaviour, latency, error rate, and approximate cost where available."],
      ["Privacy-minimised observability", "Extend traces with operational events and aggregates without storing raw prompts, drafts, source text, model messages, secrets, or personal data."],
      ["Controlled feedback capture", "Validate, minimise, and store user quality and safety feedback through a server-owned endpoint."],
      ["Fallback and failure behaviour", "Distinguish provider, quota, and network failures from safe refusals, then use a documented local-fixture or safe-error path."],
      ["Release criteria and decision", "Create measurable thresholds, an owner, a release or no-release decision, and an honest limitation."],
      ["Product communication", "Add onboarding, empty states, error states, a feedback affordance, and clear language about system boundaries."],
      ["Evidence bundle and final demo", "Prepare an architecture diagram, an evaluation table, the release checklist, rubric evidence, and a short browser demo."],
    ],
    results: "Evaluation results",
    noResults: "No evaluation run is stored yet. Enable staff access and run the suite to measure citation support, safe stops, latency, and the release gate.",
    staffOnly: "Enable staff access to run evaluation and view dashboard metrics.",
    loading: "Loading dashboard…",
    run: "Run evaluation",
    running: "Running…",
    fixture: "Fixture",
    provider: "Provider",
    mode: "Evaluation mode",
    dataset: "Dataset",
    lastRun: "Last run",
    metrics: "Quality and evidence metrics",
    passed: "Passed",
    citation: "Citation support",
    safeStop: "Safe-stop rate",
    accessIsolation: "Access isolation",
    latency: "Latency p50",
    errors: "Error rate",
    cost: "Estimated cost",
    unavailable: "unavailable",
    measures: "Release evaluation measures",
    measure: "Measure",
    question: "Question",
    bounded: "Bounded evidence",
    evaluatorLabel: "evaluator label",
    fingerprints: "citation fingerprints",
    attempts: "attempts",
    retries: "retries",
    tokens: "tokens",
    rateCard: "rate card",
    reasonCode: "reason code",
    gateTable: "Release gate",
    caseGroup: "Case group",
    casesCount: "Cases",
    requiredOutcome: "Required outcome",
    gateGroups: {
      supported_public_answers: ["Supported public answers", "Grounded result and supported public citations"],
      supported_staff_work: ["Supported staff work", "Staff access stays server-authorised"],
      ambiguous_and_no_evidence: ["Ambiguous and no evidence", "Safe clarification or no-evidence result"],
      unsafe_and_pii_intake: ["Unsafe and PII intake", "Stops before retrieval/provider access"],
      access_and_poisoned_evidence: ["Access and poisoned evidence", "No leakage and quarantine exclusion"],
      agent_approval: ["Agent approval", "One current-version decision only"],
      citation_schema_rejection: ["Citation/schema rejection", "No unsupported grounded result"],
      provider_failure: ["Provider failure", "Bounded retries then safe error"],
    },
    operational: "Operational aggregates",
    events: "events",
    feedback: "Controlled feedback",
    feedbackHint: "Quality and safety feedback is validated, bounded, and stored without free text or personal data.",
    kind: "Kind",
    quality: "Quality",
    safety: "Safety",
    rating: "Rating",
    up: "Up",
    down: "Down",
    reasons: "Reason codes",
    send: "Send feedback",
    sending: "Sending…",
    sent: "Feedback stored.",
    checklist: "Release-readiness checklist",
    checklistNote: "Checked items reflect implemented evaluation, metrics, observability, feedback, and bounded provider fallback. A named human release decision is still pending.",
    checklistItems: [
      "Evaluation set is versioned and contains expected outcomes.",
      "Citation support is measured and meets the stated criterion.",
      "Unsafe, ambiguous, no-evidence, and provider-failure paths have been tested.",
      "Basic latency, error, and cost observations are recorded or explicitly unavailable.",
      "Logs and feedback are privacy-minimised.",
      "Fallback and user-facing failure copy are demonstrated.",
      "One product limitation is documented honestly.",
      "A named human makes the release or no-release decision.",
      "Public deployment is not required for course completion.",
    ],
    scenarios: "Expected scenarios",
    scenariosLabel: "Expected outcome",
    scenarioCards: [
      ["Supported task", "A user receives a grounded response or approved draft with inspectable citations.", "Evaluation records citation support, task quality notes, latency, and the safe-state outcome."],
      ["Unsafe task", "A request attempts to bypass safeguards or contains synthetic sensitive data.", "The system safely stops before unsafe tool or model use, and evaluation captures the reason code without raw content."],
      ["Provider or quota failure", "The configured model provider is unavailable or quota-limited.", "The answer path retries once, then returns a safe error. Evaluation records attempt count, retry count, and error class."],
      ["Release-blocking case", "An evaluation case lacks citation support or violates an expected safe stop.", "The automatic release gate fails until the blocking case passes."],
    ],
    diagram: "System diagram",
    diagramNote: "Staff can run evaluation and submit bounded feedback. Nothing on this page deploys the application or records a named human release decision.",
    scope: "Still out of scope",
    scopeItems: [
      "No named human release or no-release decision is stored.",
      "No telemetry or analytics vendor SDK and no provider monitoring integration.",
      "No automatic release when the evaluation gate passes.",
      "No browser-visible provider key and no client-controlled provider choice.",
      "No fabricated passing scores when no evaluation run exists.",
    ],
    scopeNote: "Six Lab 4 capabilities are live on this dashboard. A named human release record, product communication, and the evidence bundle remain pending.",
    session: { access: "Access", public: "Public", staff: "Staff", enable: "Enable staff", pin: "Staff PIN", cancel: "Cancel", logout: "Log out", submitting: "Checking…", unavailable: "Staff access is unavailable." },
  },
  th: {
    eyebrow: "AIAT x CAMT · Lab 4",
    title: "แดชบอร์ดเกณฑ์การปล่อย",
    subtitle: "รันชุด evaluation ดูตัวชี้วัดที่มีขอบเขต และดูว่าเกตปล่อยอัตโนมัติผ่านหรือไม่",
    chat: "RAG chat", knowledge: "คลังความรู้", security: "พื้นที่ทำงานความปลอดภัย", agent: "พื้นที่ทำงานเอเจนต์", system: "ความพร้อมของระบบ",
    warning: "หน้านี้คือคอนโซลเกณฑ์การปล่อยของ Lab 4 ไม่ deploy ไม่ปล่อยอัตโนมัติ และไม่ส่ง telemetry ไปยังผู้ขาย ผล evaluation และ feedback ถูกลดข้อมูลส่วนบุคคล",
    status: {
      agent: ["เวิร์กโฟลว์ Agent v3", "ทำงานได้ · สามเครื่องมือและด่านอนุมัติจากมนุษย์"],
      gate: "เกตการปล่อย",
      deployment: ["การ deploy สาธารณะ", "ไม่จำเป็นสำหรับหลักสูตรนี้"],
      notRun: "ยังไม่มี evaluation run",
      pass: "ผ่าน",
      fail: "ไม่ผ่าน",
    },
    inheritedLabel: "สืบทอดจากแล็บก่อนหน้า",
    inherited: "สิ่งที่ใช้งานได้แล้ว",
    inheritedControls: [
      "RAG chat พร้อม citation ระดับหน้าที่มีหลักฐานรองรับ",
      "บังคับใช้สิทธิ์จากเซิร์ฟเวอร์โดย resolve จาก signed staff session",
      "controls ด้าน input, retrieval และ output: ปฏิเสธ injection และ PII กรองตามสิทธิ์ กักกันแหล่งข้อมูลที่ถูก poison และตรวจสอบ citation",
      "เวิร์กโฟลว์เอเจนต์แบบมีขอบเขต พร้อม tool สามรายการใน allowlist และงบ step คงที่",
      "การอนุมัติจากมนุษย์ครั้งเดียวที่ผูกกับ version ก่อนผลลัพธ์จำลองในเครื่อง",
      "audit record และ task trace ที่ลดข้อมูลส่วนบุคคล เก็บเฉพาะ fingerprint จำนวน และ reason code",
    ],
    build: "สิ่งที่จะสร้างใน Lab 4",
    pending: "รอดำเนินการ",
    done: "เสร็จแล้ว",
    backlog: [
      ["ชุดข้อมูล evaluation และผลลัพธ์ที่คาดหวัง", "กำหนดชุดข้อมูลขนาดเล็กที่มี version ครอบคลุมกรณี supported, ambiguous, unsafe, no-evidence และ approval พร้อมพฤติกรรมที่คาดหวัง"],
      ["ตัวรัน evaluation", "รันเคสที่ให้ผลแน่นอนกับ provider หรือโหมด fixture ที่เลือก และเก็บเฉพาะผล evaluation ที่มีขอบเขต"],
      ["ตัวชี้วัดคุณภาพและหลักฐาน", "บันทึกคุณภาพคำตอบและงาน, citation support, พฤติกรรม safe-stop, latency, error rate และค่าใช้จ่ายโดยประมาณเมื่อมีข้อมูล"],
      ["observability ที่ลดข้อมูลส่วนบุคคล", "ขยาย trace ด้วยเหตุการณ์ปฏิบัติการและค่าสรุป โดยไม่เก็บ prompt, draft, ข้อความต้นฉบับ, ข้อความจากโมเดล, secret หรือข้อมูลส่วนบุคคล"],
      ["การเก็บ feedback อย่างควบคุม", "ตรวจสอบ ลดข้อมูล และเก็บ feedback ด้านคุณภาพและความปลอดภัยของผู้ใช้ผ่าน endpoint ที่เซิร์ฟเวอร์เป็นเจ้าของ"],
      ["พฤติกรรม fallback และความล้มเหลว", "แยกความล้มเหลวของ provider, quota และ network ออกจาก safe refusal แล้วใช้เส้นทาง local-fixture หรือ safe-error ที่มีเอกสารกำกับ"],
      ["เกณฑ์การปล่อยและการตัดสินใจ", "กำหนดเกณฑ์ที่วัดได้ เจ้าของงาน การตัดสินใจ release หรือ no-release และข้อจำกัดที่เขียนอย่างตรงไปตรงมา"],
      ["การสื่อสารกับผู้ใช้ผลิตภัณฑ์", "เพิ่ม onboarding, empty state, error state, ช่องทาง feedback และภาษาที่ชัดเจนเกี่ยวกับขอบเขตของระบบ"],
      ["ชุดหลักฐานและ demo สุดท้าย", "เตรียม architecture diagram, ตาราง evaluation, release checklist, หลักฐานตาม rubric และ demo ในเบราว์เซอร์แบบสั้น"],
    ],
    results: "ผล evaluation",
    noResults: "ยังไม่มี evaluation run ที่เก็บไว้ เปิด staff access แล้วรันชุดทดสอบเพื่อวัด citation support, safe stop, latency และเกตการปล่อย",
    staffOnly: "เปิดใช้ staff access เพื่อรัน evaluation และดูตัวชี้วัดบนแดชบอร์ด",
    loading: "กำลังโหลดแดชบอร์ด…",
    run: "รัน evaluation",
    running: "กำลังรัน…",
    fixture: "Fixture",
    provider: "Provider",
    mode: "โหมด evaluation",
    dataset: "ชุดข้อมูล",
    lastRun: "รันล่าสุด",
    metrics: "ตัวชี้วัดคุณภาพและหลักฐาน",
    passed: "ผ่าน",
    citation: "citation support",
    safeStop: "อัตรา safe-stop",
    accessIsolation: "การแยกสิทธิ์",
    latency: "Latency p50",
    errors: "อัตรา error",
    cost: "ค่าใช้จ่ายโดยประมาณ",
    unavailable: "ไม่มีข้อมูล",
    measures: "มาตรวัดก่อนปล่อย",
    measure: "Measure",
    question: "Question",
    bounded: "Bounded evidence",
    evaluatorLabel: "ป้ายผู้ประเมิน",
    fingerprints: "citation fingerprints",
    attempts: "ครั้งที่พยายาม",
    retries: "retry",
    tokens: "tokens",
    rateCard: "rate card",
    reasonCode: "reason code",
    gateTable: "เกตการปล่อย",
    caseGroup: "กลุ่มเคส",
    casesCount: "จำนวนเคส",
    requiredOutcome: "ผลลัพธ์ที่ต้องได้",
    gateGroups: {
      supported_public_answers: ["คำตอบสาธารณะที่มีหลักฐาน", "ผล grounded พร้อม citation สาธารณะที่รองรับ"],
      supported_staff_work: ["งานเจ้าหน้าที่ที่มีหลักฐาน", "สิทธิ์ staff ยังถูกอนุญาตที่เซิร์ฟเวอร์"],
      ambiguous_and_no_evidence: ["คลุมเครือและไม่มีหลักฐาน", "ขอคำชี้แจงอย่างปลอดภัย หรือผลไม่มีหลักฐาน"],
      unsafe_and_pii_intake: ["อินพุตที่ไม่ปลอดภัยและ PII", "หยุดก่อน retrieval หรือเรียก provider"],
      access_and_poisoned_evidence: ["สิทธิ์เข้าถึงและหลักฐานที่ถูก poison", "ไม่รั่วไหล และกักกันแหล่งที่ถูก poison"],
      agent_approval: ["การอนุมัติเอเจนต์", "ตัดสินใจได้ครั้งเดียวบน version ปัจจุบัน"],
      citation_schema_rejection: ["ปฏิเสธ citation/schema", "ไม่มีผล grounded ที่ไม่มีหลักฐานรองรับ"],
      provider_failure: ["ความล้มเหลวของ provider", "retry อย่างมีขอบเขต แล้วคืน safe error"],
    },
    operational: "ค่าสรุปปฏิบัติการ",
    events: "เหตุการณ์",
    feedback: "feedback อย่างควบคุม",
    feedbackHint: "feedback ด้านคุณภาพและความปลอดภัยถูกตรวจสอบ จำกัดขอบเขต และเก็บโดยไม่มีข้อความอิสระหรือข้อมูลส่วนบุคคล",
    kind: "ประเภท",
    quality: "คุณภาพ",
    safety: "ความปลอดภัย",
    rating: "คะแนน",
    up: "ขึ้น",
    down: "ลง",
    reasons: "รหัสเหตุผล",
    send: "ส่ง feedback",
    sending: "กำลังส่ง…",
    sent: "บันทึก feedback แล้ว",
    checklist: "รายการตรวจสอบความพร้อมก่อนปล่อย",
    checklistNote: "รายการที่เลือกสะท้อน evaluation, ตัวชี้วัด, observability, feedback และ fallback ของ provider ที่มีขอบเขต การตัดสินใจปล่อยโดยมนุษย์ที่ระบุชื่อยังรอดำเนินการ",
    checklistItems: [
      "ชุดข้อมูล evaluation มี version และมีผลลัพธ์ที่คาดหวัง",
      "citation support ถูกวัดและผ่านเกณฑ์ที่กำหนด",
      "เส้นทาง unsafe, ambiguous, no-evidence และ provider-failure ถูกทดสอบแล้ว",
      "ค่า latency, error และ cost ขั้นพื้นฐานถูกบันทึก หรือระบุชัดว่าไม่มีข้อมูล",
      "log และ feedback ถูกลดข้อมูลส่วนบุคคลแล้ว",
      "fallback และข้อความแจ้งความล้มเหลวต่อผู้ใช้ถูกสาธิตแล้ว",
      "ข้อจำกัดของผลิตภัณฑ์หนึ่งข้อถูกเขียนไว้อย่างตรงไปตรงมา",
      "มีมนุษย์ที่ระบุชื่อได้เป็นผู้ตัดสินใจ release หรือ no-release",
      "การ deploy สาธารณะไม่จำเป็นสำหรับการจบหลักสูตร",
    ],
    scenarios: "สถานการณ์ที่คาดไว้",
    scenariosLabel: "ผลลัพธ์ที่คาดหวัง",
    scenarioCards: [
      ["งานที่รองรับได้", "ผู้ใช้ได้รับคำตอบที่มีหลักฐานหรือ draft ที่อนุมัติแล้ว พร้อม citation ที่ตรวจสอบได้", "evaluation บันทึก citation support, บันทึกคุณภาพงาน, latency และผลลัพธ์ของ safe state"],
      ["งานที่ไม่ปลอดภัย", "คำขอพยายามหลีกเลี่ยงมาตรการป้องกัน หรือมีข้อมูลอ่อนไหวสังเคราะห์", "ระบบหยุดอย่างปลอดภัยก่อนใช้ tool หรือโมเดล และ evaluation เก็บ reason code โดยไม่เก็บเนื้อหาดิบ"],
      ["provider หรือ quota ล้มเหลว", "provider ของโมเดลที่ตั้งค่าไว้ไม่พร้อมใช้งานหรือติด quota", "เส้นทางคำตอบ retry หนึ่งครั้ง แล้วคืน safe error evaluation บันทึกจำนวนครั้งที่พยายาม, retry และ error class"],
      ["เคสที่บล็อกการปล่อย", "เคส evaluation ขาด citation support หรือฝ่าฝืน safe stop ที่คาดหวัง", "เกตปล่อยอัตโนมัติไม่ผ่านจนกว่าเคสที่บล็อกจะผ่าน"],
    ],
    diagram: "System diagram",
    diagramNote: "staff สามารถรัน evaluation และส่ง feedback ที่มีขอบเขตได้ ไม่มีส่วนใดในหน้านี้ที่ deploy แอป หรือบันทึกการตัดสินใจปล่อยโดยมนุษย์ที่ระบุชื่อ",
    scope: "ยังไม่อยู่ในขอบเขต",
    scopeItems: [
      "ยังไม่เก็บการตัดสินใจ release หรือ no-release โดยมนุษย์ที่ระบุชื่อ",
      "ไม่มี SDK ของ telemetry หรือ analytics และไม่มีการเชื่อมต่อ monitoring ของ provider",
      "เกต evaluation ที่ผ่านไม่ได้ปล่อยระบบอัตโนมัติ",
      "ไม่มี provider key ที่มองเห็นได้จากเบราว์เซอร์ และให้ client เลือก provider เองไม่ได้",
      "ไม่มีคะแนนผ่านที่กุขึ้นเมื่อยังไม่มี evaluation run",
    ],
    scopeNote: "ความสามารถ Lab 4 หกข้อทำงานบนแดชบอร์ดนี้แล้ว บันทึกการปล่อยโดยมนุษย์ การสื่อสารกับผู้ใช้ และชุดหลักฐานยังรอดำเนินการ",
    session: { access: "สิทธิ์", public: "สาธารณะ", staff: "เจ้าหน้าที่", enable: "เปิดใช้ staff", pin: "Staff PIN", cancel: "ยกเลิก", logout: "ออกจากระบบ", submitting: "กำลังตรวจสอบ…", unavailable: "ไม่สามารถเปิดใช้ staff ได้" },
  },
} as const;

function checklistMet(index: number, lastRun: EvaluationRun | null): boolean {
  return index === 0 || (index === 1 && lastRun != null) || (index === 2 && lastRun != null) || (index === 3 && lastRun != null) || index === 4 || (index === 5 && lastRun != null) || index === 8;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function gateLabel(text: typeof copy.en | typeof copy.th, dashboard: EvaluationDashboard | null): string {
  if (!dashboard || dashboard.gate.status === "not_run") return text.status.notRun;
  return dashboard.gate.status === "pass" ? text.status.pass : text.status.fail;
}

function gateGroupCopy(text: typeof copy.en | typeof copy.th, id: EvaluationGateGroup): readonly [string, string] {
  return text.gateGroups[id];
}

function fingerprintPreview(values: string[]): string {
  return values.length ? values.map((value) => value.slice(0, 8)).join(" ") : "—";
}

function tokenLabel(result: EvaluationRun["results"][number], unavailable: string): string {
  if (result.promptTokens == null || result.completionTokens == null) return unavailable;
  return `${result.promptTokens}+${result.completionTokens}`;
}

function measureEvidence(text: typeof copy.en | typeof copy.th, run: EvaluationRun | null): Array<[string, string, string]> {
  if (!run) {
    return [
      ["Task quality", "Did the result satisfy its stated outcome?", "No run"],
      ["Citation support", "Do grounded claims use authorised evidence?", "No run"],
      ["Safe stop", "Did the request stop at the right boundary?", "No run"],
      ["Access isolation", "Did public/staff visibility remain correct?", "No run"],
      ["Latency and errors", "How long did it take and what failed?", "No run"],
      ["Cost", "What can this configuration measure?", `${text.rateCard} ${text.unavailable}`],
    ];
  }
  const labels = Object.entries(run.metrics.qualityNotes).map(([label, count]) => `${label}:${count}`).join(", ");
  const fingerprintCount = run.results.reduce((total, result) => total + result.citationFingerprints.length, 0);
  const reasons = [...new Set(run.results.map((result) => result.reasonCode).filter(Boolean))].join(", ") || "—";
  const attempts = run.results.reduce((total, result) => total + result.attemptCount, 0);
  const cost = run.metrics.costStatus === "available" && run.metrics.estimatedCost != null
    ? `${run.metrics.estimatedCost.toFixed(6)} USD · tokens ${run.metrics.promptTokens ?? 0}+${run.metrics.completionTokens ?? 0} · ${text.rateCard} ${run.metrics.rateCardAsOf ?? text.unavailable}`
    : `${text.unavailable} · ${text.rateCard} ${run.metrics.rateCardAsOf ?? text.unavailable}`;
  return [
    ["Task quality", "Did the result satisfy its stated outcome?", `${run.metrics.passedCount}/${run.metrics.caseCount} · ${labels}`],
    ["Citation support", "Do grounded claims use authorised evidence?", `${percent(run.metrics.citationSupportRate)} · ${fingerprintCount} ${text.fingerprints}`],
    ["Safe stop", "Did the request stop at the right boundary?", `${percent(run.metrics.safeStopPassRate)} · ${reasons} · ${attempts} ${text.attempts}`],
    ["Access isolation", "Did public/staff visibility remain correct?", `${percent(run.metrics.accessIsolationRate)} · roles ${[...new Set(run.results.map((result) => result.role))].join("/")}`],
    ["Latency and errors", "How long did it take and what failed?", `${run.metrics.latencyMsP50} ms · ${percent(run.metrics.errorRate)} errors · ${run.metrics.retryCountTotal} ${text.retries}`],
    ["Cost", "What can this configuration measure?", cost],
  ];
}

export default function SystemPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [role, setRole] = useState<UserRole>("public");
  const [dashboard, setDashboard] = useState<EvaluationDashboard | null>(null);
  const [mode, setMode] = useState<EvaluationMode>("fixture");
  const [busy, setBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("quality");
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating>("up");
  const [reasonCodes, setReasonCodes] = useState<string[]>([]);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const text = copy[language];

  async function loadDashboard() {
    const response = await fetch("/api/system/evaluation", { cache: "no-store" });
    setDashboard(response.ok ? await response.json() as EvaluationDashboard : null);
  }

  useEffect(() => { void loadDashboard(); }, []);

  async function runEvaluation(event: FormEvent) {
    event.preventDefault();
    if (busy || role !== "staff") return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/system/evaluation", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }),
      });
      const data = await response.json() as EvaluationRun & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The evaluation could not be run.");
      await loadDashboard();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The evaluation could not be run."); }
    finally { setBusy(false); }
  }

  async function sendFeedback(event: FormEvent) {
    event.preventDefault();
    if (feedbackBusy) return;
    setFeedbackBusy(true); setError(""); setFeedbackSent(false);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: feedbackKind, rating: feedbackRating, reasonCodes, surface: "system" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Feedback could not be stored.");
      setFeedbackSent(true); setReasonCodes([]);
      if (role === "staff") await loadDashboard();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Feedback could not be stored."); }
    finally { setFeedbackBusy(false); }
  }

  function toggleReason(code: string) {
    setReasonCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : current.length >= 3 ? current : [...current, code]);
  }

  const lastRun = dashboard?.lastRun ?? null;
  const results = lastRun?.results ?? [];
  const gateGroups = dashboard?.gate.groups?.length
    ? dashboard.gate.groups
    : RELEASE_GATE_GROUPS.map((group) => ({ ...group, cases: group.requiredCount, passedCount: 0, status: "not_run" as const }));

  return <main className="lab">
    <header className="hero"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="subtitle">{text.subtitle}</p></div><div className="header-actions"><nav><a href="/">{text.chat}</a><a href="/knowledge">{text.knowledge}</a><a href="/security">{text.security}</a><a href="/agent">{text.agent}</a><a href="/system" aria-current="page">{text.system}</a></nav><SessionControl labels={text.session} onRoleChange={(next) => { setRole(next); void loadDashboard(); }} /><div className="language" aria-label="Language"><button className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "th" ? "selected" : ""} onClick={() => setLanguage("th")}>ไทย</button></div></div></header>
    <p className="warning" role="alert">{text.warning}</p>

    <section className="state-strip">
      <div><span>{text.status.agent[0]}</span><strong>{text.status.agent[1]}</strong></div>
      <div><span>{text.status.gate}</span><strong>{gateLabel(text, dashboard)}</strong></div>
      <div><span>{text.status.deployment[0]}</span><strong>{text.status.deployment[1]}</strong></div>
    </section>

    <section className="eval-controls">
      <form className="eval-run" onSubmit={(event) => void runEvaluation(event)}>
        <fieldset className="retrieval-mode"><legend>{text.mode}</legend>
          <label><input type="radio" checked={mode === "fixture"} onChange={() => setMode("fixture")} disabled={busy || role !== "staff"} /> {text.fixture}</label>
          <label><input type="radio" checked={mode === "provider"} onChange={() => setMode("provider")} disabled={busy || role !== "staff"} /> {text.provider}</label>
        </fieldset>
        <button type="submit" disabled={busy || role !== "staff"}>{busy ? text.running : text.run}</button>
        <p className="eval-meta">{text.dataset}: <strong>{dashboard?.datasetVersion ?? "eval-v1"}</strong>{lastRun ? <> · {text.lastRun}: {lastRun.mode} · {new Date(lastRun.createdAt).toLocaleString()}</> : null}</p>
      </form>
      <form className="feedback-form" onSubmit={(event) => void sendFeedback(event)}>
        <p className="eyebrow">{text.feedback}</p>
        <p className="feedback-hint">{text.feedbackHint}</p>
        <label>{text.kind} <select value={feedbackKind} onChange={(event) => setFeedbackKind(event.target.value as FeedbackKind)} disabled={feedbackBusy}><option value="quality">{text.quality}</option><option value="safety">{text.safety}</option></select></label>
        <fieldset className="retrieval-mode"><legend>{text.rating}</legend>
          <label><input type="radio" checked={feedbackRating === "up"} onChange={() => setFeedbackRating("up")} disabled={feedbackBusy} /> {text.up}</label>
          <label><input type="radio" checked={feedbackRating === "down"} onChange={() => setFeedbackRating("down")} disabled={feedbackBusy} /> {text.down}</label>
        </fieldset>
        <fieldset className="reason-codes"><legend>{text.reasons}</legend>{FEEDBACK_REASONS.map((code) => <label key={code}><input type="checkbox" checked={reasonCodes.includes(code)} onChange={() => toggleReason(code)} disabled={feedbackBusy} /> {code}</label>)}</fieldset>
        <button type="submit" disabled={feedbackBusy}>{feedbackBusy ? text.sending : text.send}</button>
        {feedbackSent ? <p className="feedback-sent">{text.sent}</p> : null}
        {dashboard ? <p className="eval-meta">{dashboard.feedback.total} {text.feedback}</p> : null}
      </form>
    </section>
    {error ? <p className="error-message" role="alert">{error}</p> : null}

    <section className="metric-grid" aria-label={text.metrics}>
      <div><span>{text.passed}</span><strong>{lastRun ? `${lastRun.metrics.passedCount}/${lastRun.metrics.caseCount}` : "—"}</strong></div>
      <div><span>{text.citation}</span><strong>{lastRun ? percent(lastRun.metrics.citationSupportRate) : "—"}</strong></div>
      <div><span>{text.safeStop}</span><strong>{lastRun ? percent(lastRun.metrics.safeStopPassRate) : "—"}</strong></div>
      <div><span>{text.accessIsolation}</span><strong>{lastRun ? percent(lastRun.metrics.accessIsolationRate) : "—"}</strong></div>
      <div><span>{text.latency}</span><strong>{lastRun ? `${lastRun.metrics.latencyMsP50} ms` : "—"}</strong></div>
      <div><span>{text.errors}</span><strong>{lastRun ? percent(lastRun.metrics.errorRate) : "—"}</strong></div>
      <div><span>{text.cost}</span><strong>{lastRun ? (lastRun.metrics.costStatus === "available" && lastRun.metrics.estimatedCost != null ? String(lastRun.metrics.estimatedCost) : `${text.unavailable}${lastRun.metrics.rateCardAsOf ? ` · ${lastRun.metrics.rateCardAsOf}` : ""}`) : "—"}</strong></div>
      <div><span>{text.feedback}</span><strong>{dashboard ? String(dashboard.feedback.total) : "—"}</strong></div>
    </section>

    <section className="audit-card agent-table"><p className="eyebrow">{text.measures}</p><h2>{text.measures}</h2><div className="table-wrap"><table><caption className="sr-only">{text.measures}</caption><thead><tr><th>{text.measure}</th><th>{text.question}</th><th>{text.bounded}</th></tr></thead><tbody>{measureEvidence(text, lastRun).map(([measure, question, evidence]) => <tr key={measure}><td><strong>{measure}</strong></td><td>{question}</td><td>{evidence}</td></tr>)}</tbody></table></div></section>

    <section className="audit-card agent-table"><p className="eyebrow">{text.gateTable}</p><h2>{text.gateTable}</h2><div className="table-wrap"><table><caption className="sr-only">{text.gateTable}</caption><thead><tr><th>{text.caseGroup}</th><th>{text.casesCount}</th><th>{text.requiredOutcome}</th></tr></thead><tbody>{gateGroups.map((group) => { const [label, outcome] = gateGroupCopy(text, group.id); return <tr key={group.id}><td><strong>{label}</strong>{group.status !== "not_run" ? <span className={`status ${group.status === "pass" ? "grounded" : "refused"}`}>{group.status === "pass" ? text.status.pass : text.status.fail}</span> : null}</td><td>{group.requiredCount}</td><td>{outcome}</td></tr>; })}</tbody></table></div></section>

    <section className="audit-card agent-table"><p className="eyebrow">{text.results}</p><h2>{text.results}</h2><div className="table-wrap"><table><caption className="sr-only">{text.results}</caption><thead><tr><th>caseId</th><th>group</th><th>evaluatorLabel</th><th>role</th><th>accessIsolation</th><th>expectedOutcome</th><th>actualOutcome</th><th>citationSupport</th><th>citationFingerprints</th><th>safeStop</th><th>reasonCode</th><th>attemptCount</th><th>retryCount</th><th>latencyMs</th><th>errorClass</th><th>tokens</th><th>estimatedCost</th><th>releaseImpact</th></tr></thead><tbody>{role !== "staff" ? <tr><td colSpan={18}>{text.staffOnly}</td></tr> : !dashboard ? <tr><td colSpan={18}>{text.loading}</td></tr> : results.length === 0 ? <tr><td colSpan={18}>{text.noResults}</td></tr> : results.map((result) => <tr key={result.caseId}><td><strong>{result.caseId}</strong><span className={`status ${result.passed ? "grounded" : "refused"}`}>{result.passed ? text.status.pass : text.status.fail}</span></td><td>{gateGroupCopy(text, result.group)[0]}</td><td>{result.evaluatorLabel}</td><td>{result.role}</td><td>{String(result.accessIsolation)}</td><td>{result.expectedOutcome}</td><td>{result.actualOutcome}</td><td>{String(result.citationSupport)}</td><td className="subdata">{fingerprintPreview(result.citationFingerprints)}</td><td>{String(result.safeStop)}</td><td>{result.reasonCode ?? "—"}</td><td>{result.attemptCount}</td><td>{result.retryCount}</td><td>{result.latencyMs}</td><td>{result.errorClass}</td><td>{tokenLabel(result, text.unavailable)}</td><td>{result.estimatedCost == null ? text.unavailable : String(result.estimatedCost)}</td><td>{result.releaseImpact}</td></tr>)}</tbody></table></div></section>

    <section className="security-grid"><section className="todo-list"><p className="eyebrow">{text.inheritedLabel}</p><h2>{text.inherited}</h2><ul>{text.inheritedControls.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="todo-list"><p className="eyebrow">Lab 4</p><h2>{text.build}</h2><ol className="backlog-list">{text.backlog.map(([title, detail], index) => <li key={title}><strong>{title}</strong><span>{detail}</span><b className={`status ${index < 6 ? "grounded" : "ambiguous"}`}>{index < 6 ? text.done : text.pending}</b></li>)}</ol></section></section>

    <section className="security-grid"><section className="todo-list"><p className="eyebrow">Lab 4</p><h2>{text.checklist}</h2><p className="checklist-note">{text.checklistNote}</p><ul className="checklist">{text.checklistItems.map((item, index) => <li key={item} className={checklistMet(index, lastRun) ? "met" : undefined}>{item}</li>)}</ul></section><section className="todo-list"><p className="eyebrow">Boundary</p><h2>{text.scope}</h2><ul>{text.scopeItems.map((item) => <li key={item}>{item}</li>)}</ul><p className="workflow-note">{text.scopeNote}</p></section></section>

    <section className="scenario-list"><p className="eyebrow">Lab 4</p><h2>{text.scenarios}</h2><div className="scenario-grid">{text.scenarioCards.map(([name, prompt, outcome]) => <article className="scenario-card" key={name}><h3>{name}</h3><p>{prompt}</p><strong>{text.scenariosLabel}</strong><p>{outcome}</p></article>)}</div></section>

    <section className="security-grid"><section className="todo-list"><p className="eyebrow">Lab 4</p><h2>{text.diagram}</h2><pre className="workflow">{`user
  -> browser UI and feedback affordance
  -> server: session, policy, authorization, retrieval, validation
  -> approved knowledge base
  -> bounded agent workflow and human approval gate
  -> model provider OR documented local fixture fallback
  -> privacy-minimised trace and evaluation summaries
  -> automatic release gate`}</pre><p className="workflow-note">{text.diagramNote}</p></section></section>
  </main>;
}

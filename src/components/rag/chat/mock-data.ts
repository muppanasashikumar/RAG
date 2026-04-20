import { Chat, Message } from "@/components/rag/chat/types";

const pinnedChats: Chat[] = [
  {
    id: "policy",
    title: "Vendor security policy review",
    source: "security-policy.pdf",
    updatedAt: "2 min ago",
    status: "ready",
    messages: 18,
  },
  {
    id: "contract",
    title: "Contract renewal terms",
    source: "acme-renewal.docx",
    updatedAt: "28 min ago",
    status: "review",
    messages: 9,
  },
  {
    id: "research",
    title: "Market research summary",
    source: "q2-market-notes.pdf",
    updatedAt: "Yesterday",
    status: "ready",
    messages: 31,
  },
  {
    id: "onboarding",
    title: "Employee handbook Q&A",
    source: "handbook-2026.pdf",
    updatedAt: "Apr 15",
    status: "indexing",
    messages: 6,
  },
];

const statusCycle: Chat["status"][] = ["ready", "review", "indexing"];
const titlePrefixes = [
  "SOC2 evidence pack",
  "Data retention addendum",
  "Vendor DPA thread",
  "Incident runbook Q&A",
  "Board risk appendix",
  "Product spec deltas",
  "Sales playbook notes",
  "Engineering RFC digest",
];

function generatedRecentChats(extraCount: number): Chat[] {
  return Array.from({ length: extraCount }, (_, i) => {
    const n = i + 1;
    const prefix = titlePrefixes[i % titlePrefixes.length];
    return {
      id: `recent-${n}`,
      title: `${prefix} · session ${n}`,
      source: `workspace/docs-${String(Math.floor(n / 12) + 1).padStart(2, "0")}.pdf`,
      updatedAt: n % 5 === 0 ? "Yesterday" : `${(n * 7) % 55 || 1} min ago`,
      status: statusCycle[n % statusCycle.length],
      messages: (n * 5 + 3) % 52 + 1,
    } satisfies Chat;
  });
}

/** Full recent-chat catalog (pinned + generated). Sidebar loads this list in pages. */
export const chats: Chat[] = [...pinnedChats, ...generatedRecentChats(56)];

export const starterMessages: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "Upload a document, then ask focused questions. I will answer with grounded context, source snippets, and confidence notes.",
    citations: ["Supported: PDF, DOCX, TXT, CSV"],
  },
  {
    id: "m2",
    role: "user",
    content: "What are the vendor security obligations in this policy?",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "The policy requires annual risk reviews, incident notification within 72 hours, encryption for stored customer data, and evidence of access control audits before renewal.",
    citations: ["security-policy.pdf, page 4", "security-policy.pdf, page 9"],
  },
];

export const insights = [
  "Answer with citations only",
  "Compare sections",
  "Summarize risks",
  "Extract action items",
];

export const statusLabel: Record<Chat["status"], string> = {
  ready: "Ready",
  indexing: "Indexing",
  review: "Needs review",
};

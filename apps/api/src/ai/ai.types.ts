// Shared type definitions mirroring the Python AI service Pydantic models

export interface ClassifyRequest {
  message: string;
  context?: string;
}

export interface ClassifyResponse {
  category: string;
  priority: string;
  confidence: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TicketDraft {
  subject: string;
  description: string;
  priority: string;
  category: string;
}

export interface KBRef {
  id: string;
  title: string;
  category: string;
}

export interface ChatRequest {
  session_id: string;
  message: string;
  history: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  ticket_draft: TicketDraft | null;
  deflected: boolean;
  kb_articles: KBRef[];
}

export interface AgentAssistRequest {
  ticket_id: string;
  ticket_summary: string;
  comments: string[];
  action: 'summarise' | 'draft_reply' | 'suggest_fix' | 'draft_kb_article';
}

export interface AgentAssistResponse {
  result: string;
  kb_sources: KBRef[];
}

// Fallback responses returned when the AI service is unreachable

export const CLASSIFY_FALLBACK: ClassifyResponse = {
  category: 'Other',
  priority: 'MEDIUM',
  confidence: 0,
};

export const CHAT_FALLBACK: ChatResponse = {
  reply:
    'AI assistance is temporarily unavailable. Please describe your issue and an agent will assist you shortly.',
  ticket_draft: null,
  deflected: false,
  kb_articles: [],
};

export const AGENT_ASSIST_FALLBACK: AgentAssistResponse = {
  result:
    'AI assistance is temporarily unavailable. Please review the ticket manually.',
  kb_sources: [],
};

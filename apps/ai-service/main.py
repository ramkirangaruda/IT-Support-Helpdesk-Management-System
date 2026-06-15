"""
TicketZilla AI Microservice
FastAPI + ChromaDB + LangChain (OpenAI-compatible)
Called internally by the NestJS API — never directly by the frontend.
"""

from __future__ import annotations

import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
import chromadb
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ai-service")

# ─── Config ──────────────────────────────────────────────────────────────────

LLM_API_KEY  = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL    = os.getenv("LLM_MODEL", "gpt-4o-mini")
DATABASE_URL = os.getenv("DATABASE_URL", "")
CHROMA_PATH  = os.getenv("CHROMA_PATH", "/tmp/chroma-ticketzilla")

# Convert postgres:// → postgresql:// if needed; asyncpg uses its own DSN format
_DB_DSN = DATABASE_URL.replace("postgresql://", "postgres://").replace(
    "postgres+asyncpg://", "postgres://"
)

# ─── ChromaDB ────────────────────────────────────────────────────────────────

chroma_client: chromadb.ClientAPI = chromadb.PersistentClient(path=CHROMA_PATH)
kb_collection = chroma_client.get_or_create_collection(
    name="kb_articles",
    metadata={"hnsw:space": "cosine"},
)

# ─── LLM client ──────────────────────────────────────────────────────────────

def _make_llm(temperature: float = 0.2) -> ChatOpenAI:
    return ChatOpenAI(
        model=LLM_MODEL,
        temperature=temperature,
        openai_api_key=LLM_API_KEY,
        openai_api_base=LLM_BASE_URL,
    )

# ─── KB sync ─────────────────────────────────────────────────────────────────

async def sync_kb() -> None:
    """Load all PUBLISHED KB articles from Postgres and upsert into ChromaDB."""
    if not _DB_DSN:
        log.warning("DATABASE_URL not set — skipping KB sync")
        return
    try:
        conn = await asyncpg.connect(_DB_DSN)
        rows = await conn.fetch(
            """
            SELECT a.id, a.title, a.body, a.tags, a."updatedAt",
                   c.name AS category_name
            FROM "KBArticle" a
            LEFT JOIN "Category" c ON c.id = a."categoryId"
            WHERE a.status = 'PUBLISHED'
            """
        )
        await conn.close()

        if not rows:
            log.info("KB sync: no published articles found")
            return

        ids, docs, metas = [], [], []
        for r in rows:
            article_id = r["id"]
            tags = list(r["tags"]) if r["tags"] else []
            tag_str = ", ".join(tags)
            # Combine fields into a single embeddable document
            document = (
                f"Title: {r['title']}\n"
                f"Category: {r['category_name'] or 'General'}\n"
                f"Tags: {tag_str}\n\n"
                f"{r['body']}"
            )
            ids.append(article_id)
            docs.append(document)
            metas.append({
                "title": r["title"],
                "category": r["category_name"] or "",
                "tags": tag_str,
                "updated_at": str(r["updatedAt"]),
            })

        kb_collection.upsert(ids=ids, documents=docs, metadatas=metas)
        log.info("KB sync: upserted %d articles into ChromaDB", len(ids))

    except Exception as exc:
        log.error("KB sync failed: %s", exc)


# ─── Lifespan (startup / shutdown) ───────────────────────────────────────────

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    await sync_kb()
    scheduler.add_job(sync_kb, "interval", minutes=10, id="kb_sync")
    scheduler.start()
    log.info("AI service started. KB sync scheduled every 10 min.")
    yield
    scheduler.shutdown(wait=False)


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="TicketZilla AI Service", version="1.0.0", lifespan=lifespan)


# ─── Pydantic models ─────────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    message: str
    context: str | None = None

class ClassifyResponse(BaseModel):
    category: str
    priority: str
    confidence: float


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class TicketDraft(BaseModel):
    subject: str
    description: str
    priority: str
    category: str

class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: list[ChatMessage] = []

class KBRef(BaseModel):
    id: str
    title: str
    category: str

class ChatResponse(BaseModel):
    reply: str
    ticket_draft: TicketDraft | None = None
    deflected: bool = False
    kb_articles: list[KBRef] = []


class AgentAssistRequest(BaseModel):
    ticket_id: str
    ticket_summary: str
    comments: list[str] = []
    action: str  # "summarise" | "draft_reply" | "suggest_fix" | "draft_kb_article"

class AgentAssistResponse(BaseModel):
    result: str
    kb_sources: list[KBRef] = []


# ─── Helpers ─────────────────────────────────────────────────────────────────

CATEGORIES = [
    "Hardware", "Software", "Network", "Access & Accounts",
    "Email & Communication", "Other",
]
PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

CLASSIFY_SYSTEM = f"""You are an IT help-desk ticket classifier.
Given a user message, respond with EXACTLY this JSON (no markdown fences):
{{
  "category": "<one of: {', '.join(CATEGORIES)}>",
  "priority": "<one of: {', '.join(PRIORITIES)}>",
  "confidence": <float 0.0-1.0>
}}

Priority guide:
- CRITICAL: complete outage, security breach, data loss
- HIGH: major feature broken, affects multiple users
- MEDIUM: degraded experience, workaround available
- LOW: cosmetic, question, minor inconvenience
"""

def _search_kb(query: str, n: int = 3) -> list[dict[str, Any]]:
    """Return top-n KB articles from ChromaDB relevant to query."""
    try:
        results = kb_collection.query(query_texts=[query], n_results=n)
        articles = []
        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i]
            distance = results["distances"][0][i]
            # cosine distance → similarity (0=identical, 2=opposite; treat <0.4 as good match)
            articles.append({
                "id": doc_id,
                "title": meta.get("title", ""),
                "category": meta.get("category", ""),
                "document": results["documents"][0][i],
                "similarity": 1 - (distance / 2),  # normalise to 0-1
            })
        return articles
    except Exception as exc:
        log.warning("ChromaDB search error: %s", exc)
        return []


def _parse_json_from_llm(text: str) -> dict[str, Any]:
    """Extract JSON from LLM response, stripping markdown fences if present."""
    text = text.strip()
    # Strip ```json ... ``` fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    import json
    return json.loads(text)


def _count_user_turns(history: list[ChatMessage]) -> int:
    return sum(1 for m in history if m.role == "user")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.post("/sync-kb")
async def trigger_sync_kb() -> dict:
    """Manually trigger KB re-sync. Called by NestJS API on article publish/update."""
    import asyncio
    asyncio.create_task(sync_kb())  # fire-and-forget; returns immediately
    return {"status": "sync_started"}


@app.get("/health")
def health() -> dict:
    kb_count = kb_collection.count()
    return {"status": "ok", "kb_articles_indexed": kb_count}


@app.get("/")
def root() -> dict:
    return {"service": "ticketzilla-ai", "version": "1.0.0"}


@app.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    """Classify an IT support message into category + priority."""
    if not LLM_API_KEY:
        raise HTTPException(status_code=503, detail="LLM not configured")

    user_content = req.message
    if req.context:
        user_content = f"Context: {req.context}\n\nMessage: {req.message}"

    llm = _make_llm(temperature=0.0)
    try:
        response = await llm.ainvoke([
            SystemMessage(content=CLASSIFY_SYSTEM),
            HumanMessage(content=user_content),
        ])
        data = _parse_json_from_llm(response.content)
        category   = data.get("category", "Other")
        priority   = data.get("priority", "MEDIUM")
        confidence = float(data.get("confidence", 0.7))

        # Validate values against known lists
        if category not in CATEGORIES:
            category = "Other"
        if priority not in PRIORITIES:
            priority = "MEDIUM"
        confidence = max(0.0, min(1.0, confidence))

        return ClassifyResponse(category=category, priority=priority, confidence=confidence)

    except Exception as exc:
        log.error("/classify LLM error: %s", exc)
        # Return a safe fallback — callers must handle gracefully
        return ClassifyResponse(category="Other", priority="MEDIUM", confidence=0.0)


CHAT_SYSTEM = """You are a helpful IT support assistant for TicketZilla.
Your goal is to resolve IT issues using the knowledge base.
Be concise, friendly, and technical.
If you cannot resolve the issue in 2 exchanges, say:
"I'll create a support ticket for you so an agent can help."

When KB articles are provided in context, prefer their solutions.
Do NOT make up solutions that aren't in the KB unless they are common IT knowledge.
"""

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Conversational chat with KB-augmented context and auto ticket drafting."""

    # 1. Search KB for relevant articles
    kb_hits = _search_kb(req.message, n=3)
    top_similarity = kb_hits[0]["similarity"] if kb_hits else 0.0

    kb_refs = [
        KBRef(id=h["id"], title=h["title"], category=h["category"])
        for h in kb_hits
    ]

    # 2. High-confidence KB match → deflect immediately
    if top_similarity > 0.80 and kb_hits:
        best = kb_hits[0]
        reply = (
            f"I found an article that should help: **{best['title']}**\n\n"
            f"{best['document'][:600].strip()}\n\n"
            f"Does this resolve your issue?"
        )
        return ChatResponse(
            reply=reply,
            deflected=True,
            kb_articles=kb_refs,
        )

    # 3. Build KB context block for LLM
    kb_context = ""
    if kb_hits:
        kb_context = "\n\n---\nRelevant KB Articles:\n"
        for h in kb_hits:
            kb_context += f"\n## {h['title']}\n{h['document'][:400]}\n"

    # 4. Build LangChain message list from history
    if not LLM_API_KEY:
        return ChatResponse(
            reply="AI assistance is currently unavailable. Please submit a ticket and an agent will help you.",
            kb_articles=kb_refs,
        )

    messages: list[SystemMessage | HumanMessage] = [
        SystemMessage(content=CHAT_SYSTEM + kb_context)
    ]
    for hist_msg in req.history:
        if hist_msg.role == "user":
            messages.append(HumanMessage(content=hist_msg.content))
        else:
            # assistant messages use AIMessage; HumanMessage with role prefix is a workaround-free way
            from langchain.schema import AIMessage
            messages.append(AIMessage(content=hist_msg.content))
    messages.append(HumanMessage(content=req.message))

    llm = _make_llm(temperature=0.3)
    try:
        response = await llm.ainvoke(messages)
        reply = response.content.strip()
    except Exception as exc:
        log.error("/chat LLM error: %s", exc)
        reply = "I'm having trouble connecting to the AI service. Please try again or submit a ticket."

    # 5. After 2+ unresolved user turns, include a ticket draft
    ticket_draft = None
    user_turns = _count_user_turns(req.history) + 1  # +1 for current message
    if user_turns >= 2 and not top_similarity > 0.80:
        # Ask the LLM to classify this conversation for the draft
        classify_req = ClassifyRequest(
            message=req.message,
            context=f"Conversation so far: {req.history[-1].content if req.history else ''}",
        )
        try:
            classification = await classify(classify_req)
            ticket_draft = TicketDraft(
                subject=req.message[:120],
                description=req.message,
                priority=classification.priority,
                category=classification.category,
            )
        except Exception:
            ticket_draft = TicketDraft(
                subject=req.message[:120],
                description=req.message,
                priority="MEDIUM",
                category="Other",
            )

    return ChatResponse(
        reply=reply,
        ticket_draft=ticket_draft,
        deflected=False,
        kb_articles=kb_refs,
    )


AGENT_ASSIST_PROMPTS: dict[str, str] = {
    "summarise": (
        "Summarise this IT support ticket concisely in 2-3 sentences for an agent handover. "
        "Include the core issue, steps already taken, and current status."
    ),
    "draft_reply": (
        "Draft a professional, empathetic reply to the end user for this IT support ticket. "
        "If the KB articles contain a solution, include it. Keep it under 150 words."
    ),
    "suggest_fix": (
        "Suggest specific technical resolution steps for this IT ticket. "
        "Reference the KB articles if relevant. Number each step clearly."
    ),
    "draft_kb_article": (
        "Draft a knowledge base article based on this ticket's issue and resolution. "
        "Format: # Title\n\n## Problem\n...\n\n## Solution\n...\n\n## Steps\n1. ...\n"
        "Use plain language suitable for end users."
    ),
}

@app.post("/agent-assist", response_model=AgentAssistResponse)
async def agent_assist(req: AgentAssistRequest) -> AgentAssistResponse:
    """AI-powered agent assistance: summarise, draft reply, suggest fix, or draft KB article."""
    if req.action not in AGENT_ASSIST_PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action '{req.action}'. Valid: {list(AGENT_ASSIST_PROMPTS)}",
        )

    if not LLM_API_KEY:
        raise HTTPException(status_code=503, detail="LLM not configured")

    # Search KB for context
    kb_hits = _search_kb(req.ticket_summary, n=3)
    kb_refs = [
        KBRef(id=h["id"], title=h["title"], category=h["category"])
        for h in kb_hits
    ]

    # Build context block
    comments_text = "\n".join(
        f"- {c}" for c in req.comments
    ) if req.comments else "No comments yet."

    kb_context = ""
    if kb_hits:
        kb_context = "\n\nRelevant KB Articles:\n"
        for h in kb_hits:
            kb_context += f"\n## {h['title']}\n{h['document'][:400]}\n"

    action_instruction = AGENT_ASSIST_PROMPTS[req.action]

    system_prompt = (
        f"You are an expert IT support assistant helping a support agent.\n"
        f"Task: {action_instruction}"
        f"{kb_context}"
    )

    user_prompt = (
        f"Ticket #{req.ticket_id}\n\n"
        f"Summary: {req.ticket_summary}\n\n"
        f"Comment history:\n{comments_text}"
    )

    llm = _make_llm(temperature=0.4 if req.action == "draft_reply" else 0.2)
    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        result = response.content.strip()
    except Exception as exc:
        log.error("/agent-assist LLM error: %s", exc)
        raise HTTPException(status_code=503, detail="LLM request failed") from exc

    return AgentAssistResponse(result=result, kb_sources=kb_refs)

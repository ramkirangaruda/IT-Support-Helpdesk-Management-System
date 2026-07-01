import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatRole, Priority, TicketSource } from '@prisma/client';
import { AiAdapterService } from '../ai/ai-adapter.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { SendMessageDto } from './dto/send-message.dto';

// Regex to detect confirmation words in the user message
const CONFIRMATION_RE =
  /\b(yes|yeah|yep|ya|ok|okay|sure|please|create|created|go ahead|do it|proceed|confirm|sounds good|submit)\b/i;

// The user explicitly wants a ticket raised (any phrasing): "raise a ticket",
// "create/open/log/file a ticket", "have you created the ticket", etc.
const WANTS_TICKET_RE =
  /\b(raise|create|created|creating|open|log|logged|make|file|submit|register|new)\b[\s\S]{0,20}\bticket\b|\bticket\b[\s\S]{0,20}\b(please|now|created|create|raise|raised|open)\b/i;

// Regex to detect that the previous AI message was offering to create a ticket
const DRAFT_OFFERED_RE = /\bticket\b/i;

// Public base URL used in the ticket-creation confirmation link (matches CORS/main.ts default)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiAdapterService,
    private readonly ticketsService: TicketsService,
  ) {}

  // ── Create session ────────────────────────────────────────────────────────

  async createSession(actor: AuthenticatedUser) {
    return this.prisma.chatSession.create({
      data: { userId: actor.id },
      select: { id: true, createdAt: true, userId: true, ticketId: true },
    });
  }

  // ── Get messages ──────────────────────────────────────────────────────────

  async getMessages(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.assertSession(sessionId, actor);
    void session; // just for the ownership check
    return this.prisma.chatMessage.findMany({
      where:   { sessionId },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, role: true, content: true, createdAt: true },
    });
  }

  // ── Send message ──────────────────────────────────────────────────────────

  async sendMessage(sessionId: string, dto: SendMessageDto, actor: AuthenticatedUser) {
    const session = await this.assertSession(sessionId, actor);

    // 1. Load history BEFORE saving new message (so AI receives prior turns only)
    const priorMessages = await this.prisma.chatMessage.findMany({
      where:   { sessionId },
      orderBy: { createdAt: 'asc' },
      select:  { role: true, content: true },
    });

    // 2. Save the user's message
    await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.USER, content: dto.content },
    });

    // 3. Call AI service with history + current message
    const aiHistory = priorMessages.map(m => ({
      role:    m.role === ChatRole.USER ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    const aiResponse = await this.ai.chat({
      session_id: sessionId,
      message:    dto.content,
      history:    aiHistory,
    });

    // 4. Decide whether to create a ticket BEFORE persisting the assistant reply, so the
    //    confirmation can carry the REAL ticket id instead of the LLM's reply text.
    let ticketId: string | null = null;

    const alreadyHasTicket = session.ticketId !== null;
    if (!alreadyHasTicket && aiResponse.ticket_draft) {
      // Look at the whole conversation from the user's side — did they ask to raise a
      // ticket at any point, or confirm the assistant's offer? Matching a single exact
      // confirmation phrase was too brittle (e.g. "have you created it" was missed).
      const allUserText = [
        ...priorMessages.filter(m => m.role === ChatRole.USER).map(m => m.content),
        dto.content,
      ].join('  ');
      const askedForTicket = WANTS_TICKET_RE.test(allUserText);

      const lastAiMsg = [...priorMessages].reverse().find(m => m.role === ChatRole.ASSISTANT);
      const aiOfferedTicket = lastAiMsg ? DRAFT_OFFERED_RE.test(lastAiMsg.content) : false;
      const userConfirmed   = CONFIRMATION_RE.test(dto.content);

      if (askedForTicket || (aiOfferedTicket && userConfirmed)) {
        ticketId = await this.createTicketFromDraft(
          aiResponse.ticket_draft,
          sessionId,
          actor,
        );
      }
    }

    // 5. Persist the assistant reply. When a ticket was actually created, the confirmation
    //    is built deterministically from the REAL DB id (ticket.id) — never the LLM's reply,
    //    which can hallucinate a fake id (e.g. "ZL-2026-..."). Otherwise show the AI reply.
    const replyContent = ticketId
      ? `✓ Ticket ${ticketId} has been created. You can track it here: ${FRONTEND_URL}/tickets/${ticketId}`
      : (alreadyHasTicket && (WANTS_TICKET_RE.test(dto.content) || CONFIRMATION_RE.test(dto.content)))
        // The user is asking about the ticket again — a ticket already exists for this chat.
        ? `✓ Ticket ${session.ticketId} has already been created for this chat. You can track it here: ${FRONTEND_URL}/tickets/${session.ticketId}`
        : aiResponse.reply;

    const assistantMsg = await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.ASSISTANT, content: replyContent },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return {
      message:    assistantMsg,
      deflected:  aiResponse.deflected,
      ticketId,
      kbArticles: aiResponse.kb_articles,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertSession(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.prisma.chatSession.findUnique({
      where:  { id: sessionId },
      select: { id: true, userId: true, ticketId: true },
    });
    if (!session) throw new NotFoundException('Chat session not found');
    if (session.userId !== actor.id) throw new ForbiddenException();
    return session;
  }

  private async createTicketFromDraft(
    draft: { subject: string; description: string; priority: string; category: string },
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<string | null> {
    try {
      // Best-effort category lookup by name
      const category =
        (await this.prisma.category.findFirst({
          where: { name: { contains: draft.category, mode: 'insensitive' }, active: true },
        })) ??
        (await this.prisma.category.findFirst({ where: { active: true } }));

      if (!category) {
        this.logger.error('No active categories found — cannot create ticket from chat');
        return null;
      }

      const VALID_PRIORITIES: string[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      const priority = VALID_PRIORITIES.includes(draft.priority)
        ? (draft.priority as Priority)
        : Priority.MEDIUM;

      const ticket = await this.ticketsService.create(
        {
          subject:     draft.subject.slice(0, 200),
          description: draft.description,
          priority,
          source:      TicketSource.CHAT,
          categoryId:  category.id,
        },
        actor,
      );

      // Link the session to the newly created ticket
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data:  { ticketId: ticket.id },
      });

      return ticket.id;
    } catch (err) {
      this.logger.error(`Failed to create ticket from chat draft: ${err}`);
      return null;
    }
  }
}

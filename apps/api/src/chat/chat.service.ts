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
  /\b(yes|yeah|yep|ok|okay|sure|please|create|go ahead|do it|proceed|confirm|sounds good|submit)\b/i;

// Regex to detect that the previous AI message was offering to create a ticket
const DRAFT_OFFERED_RE = /\bticket\b/i;

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

    // 4. Save the assistant reply
    const assistantMsg = await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.ASSISTANT, content: aiResponse.reply },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    // 5. Determine whether to create a ticket
    let ticketId: string | null = null;

    const alreadyHasTicket = session.ticketId !== null;
    if (!alreadyHasTicket && aiResponse.ticket_draft) {
      const lastAiMsg = [...priorMessages].reverse().find(m => m.role === ChatRole.ASSISTANT);
      const draftWasOffered  = lastAiMsg ? DRAFT_OFFERED_RE.test(lastAiMsg.content) : false;
      const userConfirmed    = CONFIRMATION_RE.test(dto.content);

      if (draftWasOffered && userConfirmed) {
        ticketId = await this.createTicketFromDraft(
          aiResponse.ticket_draft,
          sessionId,
          actor,
        );
      }
    }

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

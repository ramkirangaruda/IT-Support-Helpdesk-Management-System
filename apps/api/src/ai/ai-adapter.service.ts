import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  AgentAssistRequest,
  AgentAssistResponse,
  AGENT_ASSIST_FALLBACK,
  CHAT_FALLBACK,
  CLASSIFY_FALLBACK,
  ChatRequest,
  ChatResponse,
  ClassifyRequest,
  ClassifyResponse,
} from './ai.types';

@Injectable()
export class AiAdapterService {
  private readonly logger = new Logger(AiAdapterService.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async classify(req: ClassifyRequest): Promise<ClassifyResponse> {
    try {
      const { data } = await this.http.post<ClassifyResponse>('/classify', req);
      return data;
    } catch (err) {
      this.logger.warn(`AI classify unavailable: ${(err as Error).message}`);
      return CLASSIFY_FALLBACK;
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      const { data } = await this.http.post<ChatResponse>('/chat', req);
      return data;
    } catch (err) {
      this.logger.warn(`AI chat unavailable: ${(err as Error).message}`);
      return CHAT_FALLBACK;
    }
  }

  async agentAssist(req: AgentAssistRequest): Promise<AgentAssistResponse> {
    try {
      const { data } = await this.http.post<AgentAssistResponse>('/agent-assist', req);
      return data;
    } catch (err) {
      this.logger.warn(`AI agent-assist unavailable: ${(err as Error).message}`);
      return AGENT_ASSIST_FALLBACK;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.http.get('/health', { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }
}

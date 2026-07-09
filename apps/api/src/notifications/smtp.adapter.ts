import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class SmtpAdapter implements OnModuleInit {
  private readonly logger = new Logger(SmtpAdapter.name);
  private transporter: Transporter | null = null;
  private fromAddress = '"TicketZilla" <noreply@example.com>';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST not configured — emails will be logged to console only (dev mode)');
      return;
    }

    const port     = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const secure   = this.config.get<string>('SMTP_SECURE', 'false') === 'true';
    const user     = this.config.get<string>('SMTP_USER', '');
    const pass     = this.config.get<string>('SMTP_PASSWORD', '');
    const fromName = this.config.get<string>('SMTP_FROM_NAME', 'TicketZilla');

    this.fromAddress = `"${fromName}" <${user}>`;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    try {
      await this.transporter.verify();
      this.logger.log(`SMTP ready — ${host}:${port} (${secure ? 'SSL' : 'STARTTLS'}) as ${user}`);
    } catch (err) {
      this.logger.warn(
        `SMTP connection verification failed: ${(err as Error).message} — emails may not be delivered`,
      );
    }
  }

  // Sends an email with 1 initial attempt + 3 retries (2s / 4s / 8s backoff).
  // Throws after all attempts are exhausted; caller decides how to handle failure.
  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.transporter) {
      // Dev fallback: print to console so local testing is frictionless
      this.logger.log(
        `[DEV EMAIL — no SMTP configured]\nTo: ${to}\nSubject: ${subject}\n\n${text}`,
      );
      return;
    }

    const retryDelaysMs = [0, 2_000, 4_000, 8_000];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, retryDelaysMs[attempt]));
        this.logger.warn(`SMTP retry ${attempt}/3 → ${to} (${subject})`);
      }

      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          html,
          text,
        });
        this.logger.log(`Email sent → ${to} [${subject}]`);
        return;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`SMTP attempt ${attempt + 1} failed for ${to}: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('SMTP send failed after all retry attempts');
  }
}

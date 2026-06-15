import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as nodemailer from 'nodemailer';

@Injectable()
export class GmailAdapter {
  private readonly logger = new Logger(GmailAdapter.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly devMode: boolean;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const clientId = config.get<string>('GMAIL_CLIENT_ID');
    this.fromAddress = config.get<string>('GMAIL_USER', 'noreply@ticketzilla.local');
    this.devMode = !clientId;
    if (this.devMode) {
      this.logger.warn('Gmail credentials not configured — email output goes to console (dev mode)');
    }
  }

  // Builds a cached OAuth2 transporter; lazily initialised on first send.
  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) return this.transporter;

    const clientId     = this.config.getOrThrow<string>('GMAIL_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GMAIL_CLIENT_SECRET');
    const refreshToken = this.config.getOrThrow<string>('GMAIL_REFRESH_TOKEN');

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth2.getAccessToken();

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type:         'OAuth2',
        user:         this.fromAddress,
        clientId,
        clientSecret,
        refreshToken,
        accessToken:  token ?? undefined,
      },
    });

    return this.transporter;
  }

  /**
   * Sends one email. Throws on failure so BullMQ can handle retries.
   * In dev mode (no GMAIL_CLIENT_ID) logs to console and returns successfully.
   */
  async send(
    to:      string,
    subject: string,
    html:    string,
    text?:   string,
    cc?:     string[],
  ): Promise<void> {
    if (this.devMode) {
      this.logger.log(
        `[DEV EMAIL]\nTo:      ${to}${cc?.length ? `\nCC:      ${cc.join(', ')}` : ''}\nSubject: ${subject}\n\n${text ?? '(html only, no plain-text body)'}`,
      );
      return;
    }

    const transport = await this.getTransporter();
    await transport.sendMail({
      from: this.fromAddress,
      to,
      ...(cc?.length ? { cc: cc.join(',') } : {}),
      subject,
      html,
      text,
    });
    this.logger.log(`Email sent → ${to}${cc?.length ? ` (CC: ${cc.join(', ')})` : ''} | ${subject}`);
  }
}

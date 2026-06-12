import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { google } from 'googleapis';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) return this.transporter;

    const clientId     = this.config.get<string>('GMAIL_CLIENT_ID');
    const clientSecret = this.config.get<string>('GMAIL_CLIENT_SECRET');
    const refreshToken = this.config.get<string>('GMAIL_REFRESH_TOKEN');
    const user         = this.config.get<string>('GMAIL_USER');

    if (!clientId || !clientSecret || !refreshToken || !user) {
      this.logger.warn('Gmail credentials not configured — email notifications disabled');
      return null as unknown as nodemailer.Transporter;
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth2.getAccessToken();

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user,
        clientId,
        clientSecret,
        refreshToken,
        accessToken: token ?? undefined,
      },
    });

    return this.transporter;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    const transport = await this.getTransporter();
    if (!transport) return;

    const from = this.config.get<string>('GMAIL_USER');
    try {
      await transport.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}

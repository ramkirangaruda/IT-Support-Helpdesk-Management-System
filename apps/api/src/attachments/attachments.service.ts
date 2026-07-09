import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Response } from 'express';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

// Absolute path to the uploads root (relative to the compiled dist, two levels up to project root)
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads', 'attachments');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const EXT_MAP: Record<string, string> = {
  'image/jpeg':    'jpg',
  'image/png':     'png',
  'image/gif':     'gif',
  'image/webp':    'webp',
  'application/pdf': 'pdf',
};

const ADMIN_ROLES = new Set<RoleName>([RoleName.IT_ADMIN, RoleName.SYS_ADMIN]);

// Magic byte checkers — return true if the buffer matches the format
function checkMagic(buf: Buffer, mimeType: string): boolean {
  if (buf.length < 12) return false;
  switch (mimeType) {
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/gif':
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
    case 'image/webp':
      // Bytes 8-11 must be 'WEBP'
      return buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    case 'application/pdf':
      // %PDF
      return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    default:
      return false;
  }
}

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(ticketId: string, user: AuthenticatedUser): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { requesterId: true, assigneeId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isAdmin = user.roles.some(r => ADMIN_ROLES.has(r as RoleName));
    if (isAdmin) return;

    const isRequester = ticket.requesterId === user.id;
    const isAssignee  = ticket.assigneeId  === user.id;
    if (!isRequester && !isAssignee) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
  }

  async uploadFiles(
    ticketId: string,
    files: Express.Multer.File[],
    user: AuthenticatedUser,
  ) {
    await this.assertAccess(ticketId, user);

    const created = [];

    for (const file of files) {
      // 1. Mime type allow-list
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type "${file.mimetype}" is not allowed. Accepted types: JPEG, PNG, GIF, WEBP, PDF.`,
        );
      }

      // 2. Magic byte verification — catch renamed/spoofed files
      if (!checkMagic(file.buffer, file.mimetype)) {
        throw new BadRequestException(
          `File "${file.originalname}" failed content validation. ` +
          `The file content does not match its declared type (${file.mimetype}).`,
        );
      }

      // 3. Generate a safe storage key — never use original filename
      const ext        = EXT_MAP[file.mimetype] ?? 'bin';
      const rand       = crypto.randomBytes(8).toString('hex');
      const storageKey = `${ticketId}/${Date.now()}-${rand}.${ext}`;
      const destPath   = path.join(UPLOADS_ROOT, storageKey);

      // 4. Ensure ticket sub-directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // 5. Write file to disk
      fs.writeFileSync(destPath, file.buffer);

      // 6. Persist metadata
      const attachment = await this.prisma.attachment.create({
        data: {
          ticketId,
          filename:   file.originalname,
          mimeType:   file.mimetype,
          sizeBytes:  file.size,
          storageKey,
        },
      });

      created.push(attachment);
    }

    return created;
  }

  async listAttachments(ticketId: string, user: AuthenticatedUser) {
    await this.assertAccess(ticketId, user);

    return this.prisma.attachment.findMany({
      where:   { ticketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async downloadAttachment(attachmentId: string, user: AuthenticatedUser, res: Response) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.assertAccess(attachment.ticketId, user);

    const filePath = path.join(UPLOADS_ROOT, attachment.storageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found on disk. It may have been deleted.');
    }

    // Images display inline; PDFs force download
    const isImage = attachment.mimeType.startsWith('image/');
    const disposition = isImage
      ? `inline; filename="${encodeURIComponent(attachment.filename)}"`
      : `attachment; filename="${encodeURIComponent(attachment.filename)}"`;

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Length', fs.statSync(filePath).size);
    fs.createReadStream(filePath).pipe(res);
  }
}

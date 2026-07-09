import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { AttachmentsService } from './attachments.service';

const MAX_FILE_SIZE  = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_COUNT = 5;

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // POST /tickets/:id/attachments
  @Post('tickets/:id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILE_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(
    @Param('id') ticketId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!files || files.length === 0) {
      return [];
    }
    return this.attachmentsService.uploadFiles(ticketId, files, user);
  }

  // GET /tickets/:id/attachments
  @Get('tickets/:id/attachments')
  list(
    @Param('id') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attachmentsService.listAttachments(ticketId, user);
  }

  // GET /attachments/:id/download
  @Get('attachments/:id/download')
  download(
    @Param('id') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    return this.attachmentsService.downloadAttachment(attachmentId, user, res);
  }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { GetConversationMessagesDto } from './dto/get-conversation-messages.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(SupabaseAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: ListConversationsDto) {
    return this.conversationsService.listMyConversations(user, query);
  }

  @Get(':id/messages')
  async getMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Query() query: GetConversationMessagesDto,
  ) {
    return this.conversationsService.getConversationMessages(user, conversationId, query);
  }

  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(user, conversationId, dto);
  }
}

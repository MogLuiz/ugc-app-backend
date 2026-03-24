import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { UsersModule } from '../users/users.module';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, ContractRequest]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsRepository, ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}

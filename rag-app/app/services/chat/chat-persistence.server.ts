import { prisma } from '~/utils/db.server';
import type { User } from '@prisma/client';

export interface ChatMessage {
  id?: string;
  pageId: string;
  workspaceId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  createdAt?: Date;
}

export interface DataFile {
  id?: string;
  pageId: string;
  workspaceId: string;
  userId: string;
  filename: string;
  tableName: string;
  schema: Array<{ name: string; type: string }>;
  rowCount: number;
  sizeBytes: number;
  uploadedAt?: Date;
}

export class ChatPersistenceService {
  // Messages
  async getMessages(pageId: string, userId: string): Promise<ChatMessage[]> {
    // Verify user has access
    const page = await this.verifyPageAccess(pageId, userId);
    if (!page) return [];

    return prisma.chatMessage.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMessage(message: ChatMessage): Promise<ChatMessage> {
    const created = await prisma.chatMessage.create({
      data: message,
    });
    return created;
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>): Promise<ChatMessage> {
    return prisma.chatMessage.update({
      where: { id: messageId },
      data: updates,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await prisma.chatMessage.delete({
      where: { id: messageId },
    });
  }

  async clearMessages(pageId: string): Promise<void> {
    await prisma.chatMessage.deleteMany({
      where: { pageId },
    });
  }

  // Data Files
  async getDataFiles(pageId: string, userId: string): Promise<DataFile[]> {
    // Verify user has access
    const page = await this.verifyPageAccess(pageId, userId);
    if (!page) return [];

    return prisma.dataFile.findMany({
      where: { pageId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async addDataFile(file: DataFile): Promise<DataFile> {
    const created = await prisma.dataFile.create({
      data: file,
    });
    return created;
  }

  async deleteDataFile(fileId: string): Promise<void> {
    await prisma.dataFile.delete({
      where: { id: fileId },
    });
  }

  async clearDataFiles(pageId: string): Promise<void> {
    await prisma.dataFile.deleteMany({
      where: { pageId },
    });
  }

  // Sync from client
  async syncFromClient(
    pageId: string,
    userId: string,
    messages: ChatMessage[],
    dataFiles: DataFile[]
  ): Promise<void> {
    const page = await this.verifyPageAccess(pageId, userId);
    if (!page) throw new Error('Page not found or access denied');

    // Clear existing data
    await Promise.all([
      this.clearMessages(pageId),
      this.clearDataFiles(pageId),
    ]);

    // Add new data
    if (messages.length > 0) {
      await prisma.chatMessage.createMany({
        data: messages.map(m => ({
          ...m,
          pageId,
          workspaceId: page.workspaceId,
          userId,
        })),
      });
    }

    if (dataFiles.length > 0) {
      await prisma.dataFile.createMany({
        data: dataFiles.map(f => ({
          ...f,
          pageId,
          workspaceId: page.workspaceId,
          userId,
        })),
      });
    }
  }

  // Helpers
  private async verifyPageAccess(pageId: string, userId: string) {
    return prisma.page.findFirst({
      where: {
        id: pageId,
        workspace: {
          users: {
            some: {
              userId,
            },
          },
        },
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });
  }
}

export const chatPersistence = new ChatPersistenceService();
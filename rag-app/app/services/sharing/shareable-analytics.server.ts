import { prisma } from '~/utils/db.server';
import crypto from 'crypto';
import { redis } from '~/utils/redis.server';

export interface ShareableLink {
  id: string;
  url: string;
  shortCode: string;
  data: any;
  type: 'chart' | 'table' | 'insight' | 'dashboard';
  expiresAt?: Date;
  password?: string;
  viewCount: number;
  createdBy: string;
  workspaceId: string;
  projectId?: string;
  embedCode?: string;
  socialPreview?: {
    title: string;
    description: string;
    image?: string;
  };
}

export interface ShareOptions {
  expirationHours?: number; // Link expiration in hours
  password?: string; // Optional password protection
  allowEmbed?: boolean; // Allow embedding as iframe
  maxViews?: number; // Maximum number of views
  socialPreview?: {
    title: string;
    description: string;
    image?: string;
  };
}

/**
 * Service for creating and managing shareable analytics links
 */
export class ShareableAnalyticsService {
  /**
   * Create a shareable link for analytics data
   */
  static async createShareableLink(
    data: any,
    type: ShareableLink['type'],
    userId: string,
    workspaceId: string,
    options: ShareOptions = {}
  ): Promise<ShareableLink> {
    // Generate unique short code
    const shortCode = this.generateShortCode();
    
    // Hash password if provided
    const hashedPassword = options.password 
      ? crypto.createHash('sha256').update(options.password).digest('hex')
      : undefined;
    
    // Calculate expiration
    const expiresAt = options.expirationHours
      ? new Date(Date.now() + options.expirationHours * 60 * 60 * 1000)
      : undefined;
    
    // Store in database
    const shareableLink = await prisma.shareableLink.create({
      data: {
        shortCode,
        type,
        data,
        password: hashedPassword,
        expiresAt,
        maxViews: options.maxViews,
        viewCount: 0,
        createdBy: userId,
        workspaceId,
        metadata: {
          socialPreview: options.socialPreview,
          allowEmbed: options.allowEmbed,
        }
      }
    });
    
    // Cache in Redis for fast access
    await this.cacheShareableLink(shareableLink);
    
    // Generate full URL
    const baseUrl = process.env.APP_URL || 'https://app.example.com';
    const url = `${baseUrl}/share/${shortCode}`;
    
    // Generate embed code if allowed
    const embedCode = options.allowEmbed
      ? this.generateEmbedCode(url, data.title || 'Analytics')
      : undefined;
    
    return {
      id: shareableLink.id,
      url,
      shortCode,
      data,
      type,
      expiresAt,
      viewCount: 0,
      createdBy: userId,
      workspaceId,
      embedCode,
      socialPreview: options.socialPreview,
    };
  }
  
  /**
   * Get shareable link by short code
   */
  static async getShareableLink(
    shortCode: string,
    password?: string
  ): Promise<ShareableLink | null> {
    // Try cache first
    const cached = await this.getCachedShareableLink(shortCode);
    if (cached) {
      return this.validateAndUpdateLink(cached, password);
    }
    
    // Fallback to database
    const link = await prisma.shareableLink.findUnique({
      where: { shortCode }
    });
    
    if (!link) return null;
    
    // Cache for next time
    await this.cacheShareableLink(link);
    
    return this.validateAndUpdateLink(link, password);
  }
  
  /**
   * Validate link and update view count
   */
  private static async validateAndUpdateLink(
    link: any,
    password?: string
  ): Promise<ShareableLink | null> {
    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return null;
    }
    
    // Check view limit
    if (link.maxViews && link.viewCount >= link.maxViews) {
      return null;
    }
    
    // Check password
    if (link.password) {
      if (!password) return null;
      
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      if (hashedPassword !== link.password) return null;
    }
    
    // Increment view count
    await this.incrementViewCount(link.shortCode);
    
    const baseUrl = process.env.APP_URL || 'https://app.example.com';
    
    return {
      id: link.id,
      url: `${baseUrl}/share/${link.shortCode}`,
      shortCode: link.shortCode,
      data: link.data,
      type: link.type,
      expiresAt: link.expiresAt,
      viewCount: link.viewCount + 1,
      createdBy: link.createdBy,
      workspaceId: link.workspaceId,
      projectId: link.projectId,
      socialPreview: link.metadata?.socialPreview,
    };
  }
  
  /**
   * Generate unique short code
   */
  private static generateShortCode(length: number = 8): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    
    return code;
  }
  
  /**
   * Generate embed code for iframe
   */
  private static generateEmbedCode(url: string, title: string): string {
    return `<iframe 
  src="${url}?embed=true" 
  title="${title}"
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 8px;"
></iframe>`;
  }
  
  /**
   * Cache shareable link in Redis
   */
  private static async cacheShareableLink(link: any): Promise<void> {
    const key = `share:${link.shortCode}`;
    const ttl = link.expiresAt 
      ? Math.floor((new Date(link.expiresAt).getTime() - Date.now()) / 1000)
      : 86400; // Default 24 hours
    
    await redis.setex(key, ttl, JSON.stringify(link));
  }
  
  /**
   * Get cached shareable link
   */
  private static async getCachedShareableLink(shortCode: string): Promise<any | null> {
    const key = `share:${shortCode}`;
    const cached = await redis.get(key);
    
    return cached ? JSON.parse(cached) : null;
  }
  
  /**
   * Increment view count
   */
  private static async incrementViewCount(shortCode: string): Promise<void> {
    // Update in database
    await prisma.shareableLink.update({
      where: { shortCode },
      data: { viewCount: { increment: 1 } }
    });
    
    // Update cache
    const key = `share:${shortCode}`;
    const cached = await redis.get(key);
    if (cached) {
      const link = JSON.parse(cached);
      link.viewCount++;
      await redis.setex(key, 86400, JSON.stringify(link));
    }
  }
  
  /**
   * Delete shareable link
   */
  static async deleteShareableLink(shortCode: string, userId: string): Promise<boolean> {
    const link = await prisma.shareableLink.findUnique({
      where: { shortCode }
    });
    
    if (!link || link.createdBy !== userId) {
      return false;
    }
    
    // Delete from database
    await prisma.shareableLink.delete({
      where: { shortCode }
    });
    
    // Delete from cache
    await redis.del(`share:${shortCode}`);
    
    return true;
  }
  
  /**
   * Get all shareable links for a user
   */
  static async getUserShareableLinks(
    userId: string,
    workspaceId?: string
  ): Promise<ShareableLink[]> {
    const links = await prisma.shareableLink.findMany({
      where: {
        createdBy: userId,
        ...(workspaceId && { workspaceId })
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const baseUrl = process.env.APP_URL || 'https://app.example.com';
    
    return links.map(link => ({
      id: link.id,
      url: `${baseUrl}/share/${link.shortCode}`,
      shortCode: link.shortCode,
      data: link.data,
      type: link.type as ShareableLink['type'],
      expiresAt: link.expiresAt || undefined,
      viewCount: link.viewCount,
      createdBy: link.createdBy,
      workspaceId: link.workspaceId,
      projectId: link.projectId || undefined,
      socialPreview: link.metadata?.socialPreview,
    }));
  }
  
  /**
   * Generate Open Graph meta tags for social sharing
   */
  static generateOpenGraphTags(link: ShareableLink): string {
    const preview = link.socialPreview;
    if (!preview) return '';
    
    const baseUrl = process.env.APP_URL || 'https://app.example.com';
    
    return `
      <meta property="og:title" content="${preview.title}" />
      <meta property="og:description" content="${preview.description}" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="${link.url}" />
      ${preview.image ? `<meta property="og:image" content="${preview.image}" />` : ''}
      <meta property="og:site_name" content="RAG Analytics" />
      
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${preview.title}" />
      <meta name="twitter:description" content="${preview.description}" />
      ${preview.image ? `<meta name="twitter:image" content="${preview.image}" />` : ''}
    `;
  }
  
  /**
   * Export analytics as interactive HTML report
   */
  static generateInteractiveReport(data: any, type: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title || 'Analytics Report'}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 p-8">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">${data.title || 'Analytics Report'}</h1>
    <p class="text-gray-600 mb-8">${data.description || ''}</p>
    
    <div id="chart-container" class="bg-white rounded-lg shadow p-6">
      <canvas id="chart"></canvas>
    </div>
    
    <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
      ${data.insights?.map((insight: string) => `
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-600">${insight}</p>
        </div>
      `).join('') || ''}
    </div>
  </div>
  
  <script>
    const ctx = document.getElementById('chart').getContext('2d');
    const chartData = ${JSON.stringify(data.chartData || {})};
    
    new Chart(ctx, {
      type: '${type}',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
      }
    });
  </script>
</body>
</html>
    `;
  }
}
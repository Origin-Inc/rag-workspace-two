#!/usr/bin/env tsx
/**
 * Rollback script to restore project-based structure from page hierarchy
 * 
 * This script provides emergency rollback capability to revert from the
 * Notion-style page hierarchy back to the original project structure.
 * 
 * Usage:
 *   npm run rollback:hierarchy -- --dry-run  # Test rollback without changes
 *   npm run rollback:hierarchy -- --force    # Execute rollback
 *   npm run rollback:hierarchy -- --status   # Check migration status
 */

import { PrismaClient } from '@prisma/client';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';

const prisma = new PrismaClient();

interface RollbackOptions {
  dryRun: boolean;
  force: boolean;
  status: boolean;
  backupPath?: string;
}

interface MigrationStatus {
  hasBackup: boolean;
  currentStructure: 'projects' | 'hierarchy' | 'mixed';
  pageCount: number;
  projectCount: number;
  orphanedPages: number;
  canRollback: boolean;
  lastMigration?: Date;
}

class HierarchyRollbackService {
  private backupDir = join(process.cwd(), '.backups');
  
  /**
   * Check current migration status
   */
  async checkStatus(): Promise<MigrationStatus> {
    // Check for backup files
    const backupPath = join(this.backupDir, 'pre-hierarchy-migration.json.gz');
    const hasBackup = existsSync(backupPath);

    // Analyze current database state
    const pages = await prisma.page.findMany({
      select: {
        id: true,
        projectId: true,
        parentId: true,
        metadata: true
      }
    });

    const projects = await prisma.project.findMany();
    
    // Determine current structure
    const pagesWithProjects = pages.filter(p => p.projectId !== null);
    const pagesWithParents = pages.filter(p => p.parentId !== null);
    const migratedPages = pages.filter(p => 
      (p.metadata as any)?.migratedFromProject === true
    );

    let currentStructure: 'projects' | 'hierarchy' | 'mixed';
    if (pagesWithProjects.length > pages.length * 0.8) {
      currentStructure = 'projects';
    } else if (pagesWithParents.length > pages.length * 0.5 || migratedPages.length > 0) {
      currentStructure = 'hierarchy';
    } else {
      currentStructure = 'mixed';
    }

    // Find orphaned pages (no project and no parent)
    const orphanedPages = pages.filter(p => !p.projectId && !p.parentId);

    return {
      hasBackup,
      currentStructure,
      pageCount: pages.length,
      projectCount: projects.length,
      orphanedPages: orphanedPages.length,
      canRollback: hasBackup && currentStructure !== 'projects',
      lastMigration: migratedPages[0] ? 
        new Date((migratedPages[0].metadata as any).migrationDate) : 
        undefined
    };
  }

  /**
   * Create backup before any migration
   */
  async createBackup(tag: string = 'pre-hierarchy-migration'): Promise<string> {
    console.log('📦 Creating backup...');
    
    // Ensure backup directory exists
    if (!existsSync(this.backupDir)) {
      await mkdir(this.backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = join(this.backupDir, `${tag}-${timestamp}.json`);
    const compressedFile = `${backupFile}.gz`;

    // Export all relevant data
    const backupData = {
      timestamp: new Date().toISOString(),
      tag,
      projects: await prisma.project.findMany(),
      pages: await prisma.page.findMany({
        include: { blocks: true }
      }),
      workspaces: await prisma.workspace.findMany(),
      userWorkspaces: await prisma.userWorkspace.findMany()
    };

    // Write and compress backup
    const writeStream = createWriteStream(backupFile);
    writeStream.write(JSON.stringify(backupData, null, 2));
    writeStream.end();

    await pipeline(
      createReadStream(backupFile),
      createGzip(),
      createWriteStream(compressedFile)
    );

    console.log(`✅ Backup created: ${compressedFile}`);
    return compressedFile;
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    console.log('📂 Reading backup...');
    
    // Decompress and read backup
    const tempFile = backupPath.replace('.gz', '');
    await pipeline(
      createReadStream(backupPath),
      createGunzip(),
      createWriteStream(tempFile)
    );

    const backupData = JSON.parse(
      require('fs').readFileSync(tempFile, 'utf-8')
    );

    console.log(`📅 Backup from: ${backupData.timestamp}`);
    console.log(`📊 Contains: ${backupData.pages.length} pages, ${backupData.projects.length} projects`);

    // Restore in transaction
    await prisma.$transaction(async (tx) => {
      // Clear current data
      await tx.block.deleteMany();
      await tx.page.deleteMany();
      await tx.project.deleteMany();

      // Restore projects first
      for (const project of backupData.projects) {
        await tx.project.create({ data: project });
      }

      // Restore pages with blocks
      for (const pageData of backupData.pages) {
        const { blocks, ...page } = pageData;
        
        await tx.page.create({
          data: {
            ...page,
            blocks: {
              create: blocks
            }
          }
        });
      }
    });

    console.log('✅ Backup restored successfully');
  }

  /**
   * Perform rollback from hierarchy to projects
   */
  async rollback(options: RollbackOptions): Promise<void> {
    const status = await this.checkStatus();

    if (!status.canRollback) {
      throw new Error('Cannot rollback: ' + 
        (!status.hasBackup ? 'No backup found' : 'Already in project structure'));
    }

    if (options.dryRun) {
      console.log('🔍 DRY RUN - No changes will be made');
      console.log(`Would rollback ${status.pageCount} pages`);
      return;
    }

    if (!options.force) {
      console.log('⚠️  This will restore the project-based structure');
      console.log('Run with --force to proceed');
      return;
    }

    console.log('🔄 Starting rollback...');

    // Create safety backup before rollback
    await this.createBackup('pre-rollback');

    await prisma.$transaction(async (tx) => {
      // Find pages that were created from projects
      const migratedRootPages = await tx.page.findMany({
        where: {
          metadata: {
            path: ['migratedFromProject'],
            equals: true
          }
        }
      });

      console.log(`Found ${migratedRootPages.length} migrated root pages to remove`);

      // Restore page-project relationships
      for (const rootPage of migratedRootPages) {
        const originalProjectId = (rootPage.metadata as any).originalProjectId;
        
        if (originalProjectId) {
          // Update child pages to restore project relationship
          await tx.page.updateMany({
            where: { parentId: rootPage.id },
            data: {
              projectId: originalProjectId,
              parentId: null,
              metadata: {}
            }
          });
        }

        // Delete the migrated root page
        await tx.page.delete({
          where: { id: rootPage.id }
        });
      }

      // Clear parent relationships for all remaining pages
      await tx.page.updateMany({
        where: { parentId: { not: null } },
        data: { parentId: null }
      });

      console.log('✅ Page-project relationships restored');
    });

    // Restore project routes from backup
    await this.restoreProjectRoutes();

    console.log('🎉 Rollback completed successfully');
  }

  /**
   * Restore project route files from backup
   */
  private async restoreProjectRoutes(): Promise<void> {
    const deprecatedDir = join(process.cwd(), 'deprecated', 'routes');
    const routesDir = join(process.cwd(), 'app', 'routes');

    if (!existsSync(deprecatedDir)) {
      console.log('⚠️  No deprecated routes to restore');
      return;
    }

    const files = require('fs').readdirSync(deprecatedDir);
    
    for (const file of files) {
      const source = join(deprecatedDir, file);
      const dest = join(routesDir, file);
      
      require('fs').copyFileSync(source, dest);
      console.log(`  Restored: ${file}`);
    }

    console.log(`✅ Restored ${files.length} route files`);
  }

  /**
   * Validate data integrity after rollback
   */
  async validateRollback(): Promise<boolean> {
    console.log('🔍 Validating rollback...');

    const issues: string[] = [];

    // Check for orphaned pages
    const orphanedPages = await prisma.page.findMany({
      where: {
        AND: [
          { projectId: null },
          { workspaceId: null }
        ]
      }
    });

    if (orphanedPages.length > 0) {
      issues.push(`Found ${orphanedPages.length} orphaned pages`);
    }

    // Check for pages with invalid project references
    const pagesWithProjects = await prisma.page.findMany({
      where: { projectId: { not: null } },
      include: { project: true }
    });

    const invalidProjectRefs = pagesWithProjects.filter(p => !p.project);
    if (invalidProjectRefs.length > 0) {
      issues.push(`Found ${invalidProjectRefs.length} pages with invalid project references`);
    }

    // Check for circular references (shouldn't exist after rollback)
    const pagesWithParents = await prisma.page.findMany({
      where: { parentId: { not: null } }
    });

    if (pagesWithParents.length > 0) {
      issues.push(`Found ${pagesWithParents.length} pages still with parent relationships`);
    }

    if (issues.length > 0) {
      console.log('⚠️  Validation issues found:');
      issues.forEach(issue => console.log(`  - ${issue}`));
      return false;
    }

    console.log('✅ Validation passed');
    return true;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const service = new HierarchyRollbackService();

  const options: RollbackOptions = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    status: args.includes('--status'),
    backupPath: args.find(arg => arg.startsWith('--backup='))?.split('=')[1]
  };

  try {
    if (options.status) {
      const status = await service.checkStatus();
      console.log('\n📊 Migration Status:');
      console.log(`  Structure: ${status.currentStructure}`);
      console.log(`  Pages: ${status.pageCount}`);
      console.log(`  Projects: ${status.projectCount}`);
      console.log(`  Orphaned pages: ${status.orphanedPages}`);
      console.log(`  Has backup: ${status.hasBackup ? '✅' : '❌'}`);
      console.log(`  Can rollback: ${status.canRollback ? '✅' : '❌'}`);
      if (status.lastMigration) {
        console.log(`  Last migration: ${status.lastMigration.toLocaleString()}`);
      }
    } else if (options.backupPath) {
      await service.restoreFromBackup(options.backupPath);
    } else {
      await service.rollback(options);
      if (!options.dryRun && options.force) {
        await service.validateRollback();
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
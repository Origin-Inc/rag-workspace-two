#!/usr/bin/env tsx
/**
 * Migration script to convert project-based structure to page hierarchy
 * 
 * This script:
 * 1. Migrates existing project pages to workspace pages
 * 2. Creates parent pages from projects
 * 3. Maintains relationships and permissions
 * 4. Preserves all content and metadata
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
  projectsProcessed: number;
  pagesConverted: number;
  pagesMigrated: number;
  errors: string[];
}

async function migrateProjectsToPages(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    projectsProcessed: 0,
    pagesConverted: 0,
    pagesMigrated: 0,
    errors: []
  };

  try {
    console.log('Starting project to page hierarchy migration');

    // Get all projects with their pages
    const projects = await prisma.project.findMany({
      include: {
        pages: {
          where: { isArchived: false }
        }
      }
    });

    console.log(`Found ${projects.length} projects to migrate`);

    for (const project of projects) {
      try {
        await prisma.$transaction(async (tx) => {
          console.log(`Processing project: ${project.name} (${project.id}`);

          // Check if this project should become a parent page
          if (project.pages.length > 0) {
            // Create a parent page from the project
            const parentPage = await tx.page.create({
              data: {
                workspaceId: project.workspaceId,
                title: project.name,
                slug: project.slug,
                content: project.description ? 
                  { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: project.description }] }] } :
                  { type: 'doc', content: [] },
                blocks: [],
                icon: '📁', // Folder icon for converted projects
                position: stats.projectsProcessed,
                projectId: project.id, // Keep reference for rollback
                metadata: {
                  migratedFromProject: true,
                  originalProjectId: project.id,
                  migrationDate: new Date().toISOString()
                }
              }
            });

            stats.pagesConverted++;
            console.log(`Created parent page from project: ${parentPage.title}`);

            // Update all project pages to have this parent and workspace
            for (const page of project.pages) {
              await tx.page.update({
                where: { id: page.id },
                data: {
                  parentId: parentPage.id,
                  workspaceId: project.workspaceId,
                  metadata: {
                    ...(page.metadata as any || {}),
                    migratedFromProject: true,
                    migrationDate: new Date().toISOString()
                  }
                }
              });
              stats.pagesMigrated++;
            }
          } else {
            // Project has no pages, just create an empty parent page
            await tx.page.create({
              data: {
                workspaceId: project.workspaceId,
                title: project.name,
                slug: project.slug,
                content: project.description ? 
                  { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: project.description }] }] } :
                  { type: 'doc', content: [] },
                blocks: [],
                icon: '📁',
                position: stats.projectsProcessed,
                projectId: project.id,
                metadata: {
                  migratedFromProject: true,
                  originalProjectId: project.id,
                  migrationDate: new Date().toISOString(),
                  emptyProject: true
                }
              }
            });
            stats.pagesConverted++;
          }

          stats.projectsProcessed++;
        });
      } catch (error) {
        const errorMessage = `Failed to migrate project ${project.id}: ${error}`;
        console.error(errorMessage);
        stats.errors.push(errorMessage);
      }
    }

    // No longer need to check for orphan pages since workspaceId is now required
    // This section can be removed in the new architecture

    console.log('Migration completed', stats);
    return stats;

  } catch (error) {
    console.error('Migration failed', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Rollback function in case something goes wrong
async function rollbackMigration(): Promise<void> {
  console.log('Starting rollback');

  try {
    // Remove pages that were created from projects
    await prisma.page.deleteMany({
      where: {
        metadata: {
          path: ['migratedFromProject'],
          equals: true
        }
      }
    });

    // Reset parent relationships for migrated pages
    await prisma.page.updateMany({
      where: {
        metadata: {
          path: ['migratedFromProject'],
          equals: true
        }
      },
      data: {
        parentId: null
      }
    });

    console.log('Rollback completed');
  } catch (error) {
    console.error('Rollback failed', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--rollback')) {
    console.log('🔄 Rolling back migration...');
    await rollbackMigration();
    console.log('✅ Rollback complete');
  } else {
    console.log('🚀 Starting project to page hierarchy migration...');
    console.log('⚠️  This will modify your database. Make sure you have a backup!');
    console.log('');
    
    if (!args.includes('--force')) {
      console.log('Run with --force to proceed, or --rollback to undo a previous migration');
      process.exit(0);
    }

    const stats = await migrateProjectsToPages();
    
    console.log('');
    console.log('✅ Migration complete!');
    console.log(`📊 Statistics:`);
    console.log(`   - Projects processed: ${stats.projectsProcessed}`);
    console.log(`   - Pages created from projects: ${stats.pagesConverted}`);
    console.log(`   - Pages migrated: ${stats.pagesMigrated}`);
    
    if (stats.errors.length > 0) {
      console.log(`   - Errors: ${stats.errors.length}`);
      stats.errors.forEach(error => console.error(`     ❌ ${error}`));
    }
  }
}

// Run the migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
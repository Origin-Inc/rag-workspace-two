// Task 12.9: API endpoint for workspace template operations
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { createSupabaseServerClient } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('WorkspaceTemplates');

interface TemplateStructure {
  name: string;
  structure: {
    pages: number;
    databases: number;
    templates: number;
    automations: number;
  };
  features: string[];
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const action = formData.get('action') as string;

  try {
    switch (action) {
      case 'clone_template': {
        const templateId = formData.get('templateId') as string;
        const workspaceId = formData.get('workspaceId') as string;
        const templateDataStr = formData.get('templateData') as string;
        const templateData: TemplateStructure = JSON.parse(templateDataStr);

        logger.info('Cloning template', { templateId, workspaceId });

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers });
        }

        // Clone template structure based on template ID
        const result = await cloneTemplateToWorkspace(
          supabase,
          templateId,
          workspaceId,
          user.id,
          templateData
        );

        return json({ success: true, ...result }, { headers });
      }

      case 'get_template_preview': {
        const templateId = formData.get('templateId') as string;
        
        // Get template preview data
        const preview = await getTemplatePreview(templateId);
        
        return json({ success: true, preview }, { headers });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400, headers });
    }
  } catch (error) {
    logger.error('Template operation failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'Template operation failed' },
      { status: 500, headers }
    );
  }
}

async function cloneTemplateToWorkspace(
  supabase: any,
  templateId: string,
  workspaceId: string,
  userId: string,
  templateData: TemplateStructure
) {
  const createdItems = {
    pages: [] as any[],
    databases: [] as any[],
    automations: [] as any[]
  };

  try {
    // Create template pages based on template type
    const pageTemplates = getTemplatePages(templateId);
    
    for (const pageTemplate of pageTemplates) {
      const { data: page, error } = await supabase
        .from('pages')
        .insert({
          workspace_id: workspaceId,
          title: pageTemplate.title,
          content: pageTemplate.content,
          icon: pageTemplate.icon,
          parent_id: pageTemplate.parentId || null,
          created_by: userId,
          updated_by: userId,
          metadata: {
            template_id: templateId,
            is_template: true
          }
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create page', error);
        continue;
      }

      createdItems.pages.push(page);
    }

    // Create template databases
    const databaseTemplates = getTemplateDatabases(templateId);
    
    for (const dbTemplate of databaseTemplates) {
      // Create database pages (simplified for now)
      const { data: dbPage, error } = await supabase
        .from('pages')
        .insert({
          workspace_id: workspaceId,
          title: dbTemplate.title,
          content: '',
          icon: dbTemplate.icon,
          created_by: userId,
          updated_by: userId,
          metadata: {
            template_id: templateId,
            is_database: true,
            database_config: dbTemplate.config
          }
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create database', error);
        continue;
      }

      createdItems.databases.push(dbPage);
    }

    // Track template usage
    await supabase
      .from('template_usage')
      .insert({
        template_id: templateId,
        workspace_id: workspaceId,
        user_id: userId,
        applied_at: new Date().toISOString()
      });

    logger.info('Template cloned successfully', {
      templateId,
      workspaceId,
      createdPages: createdItems.pages.length,
      createdDatabases: createdItems.databases.length
    });

    return createdItems;
    
  } catch (error) {
    logger.error('Failed to clone template', error);
    throw error;
  }
}

function getTemplatePages(templateId: string) {
  // Template page structures
  const templates: Record<string, any[]> = {
    'project-tracker': [
      {
        title: 'Project Overview',
        content: '# Project Overview\n\nWelcome to your project workspace!',
        icon: '📊',
        parentId: null
      },
      {
        title: 'Sprint Planning',
        content: '# Sprint Planning\n\n## Current Sprint\n\n## Backlog',
        icon: '🏃',
        parentId: null
      },
      {
        title: 'Team Dashboard',
        content: '# Team Dashboard\n\n## Team Members\n\n## Workload',
        icon: '👥',
        parentId: null
      },
      {
        title: 'Documentation',
        content: '# Project Documentation\n\n## Technical Specs\n\n## User Guides',
        icon: '📚',
        parentId: null
      }
    ],
    'product-roadmap': [
      {
        title: 'Product Vision',
        content: '# Product Vision & Strategy\n\n## Mission\n\n## Goals',
        icon: '🎯',
        parentId: null
      },
      {
        title: 'Feature Roadmap',
        content: '# Feature Roadmap\n\n## Q1 2024\n\n## Q2 2024',
        icon: '🗺️',
        parentId: null
      },
      {
        title: 'Release Notes',
        content: '# Release Notes\n\n## Latest Release\n\n## Previous Releases',
        icon: '📝',
        parentId: null
      }
    ],
    'marketing-campaign': [
      {
        title: 'Campaign Hub',
        content: '# Marketing Campaign Hub\n\n## Active Campaigns\n\n## Planning',
        icon: '📢',
        parentId: null
      },
      {
        title: 'Content Calendar',
        content: '# Content Calendar\n\n## This Month\n\n## Upcoming',
        icon: '📅',
        parentId: null
      },
      {
        title: 'Analytics Dashboard',
        content: '# Marketing Analytics\n\n## Performance Metrics\n\n## ROI',
        icon: '📈',
        parentId: null
      }
    ],
    'team-wiki': [
      {
        title: 'Welcome',
        content: '# Team Wiki\n\nWelcome to our knowledge base!',
        icon: '👋',
        parentId: null
      },
      {
        title: 'Getting Started',
        content: '# Getting Started\n\n## Onboarding\n\n## Tools & Access',
        icon: '🚀',
        parentId: null
      },
      {
        title: 'Processes',
        content: '# Team Processes\n\n## Development\n\n## Communication',
        icon: '⚙️',
        parentId: null
      },
      {
        title: 'Resources',
        content: '# Resources\n\n## Tools\n\n## Templates\n\n## Guidelines',
        icon: '📦',
        parentId: null
      }
    ],
    'startup-toolkit': [
      {
        title: 'Business Model',
        content: '# Business Model Canvas\n\n## Value Proposition\n\n## Customer Segments',
        icon: '💼',
        parentId: null
      },
      {
        title: 'Investor Relations',
        content: '# Investor Relations\n\n## Pitch Deck\n\n## Metrics',
        icon: '💰',
        parentId: null
      },
      {
        title: 'OKRs',
        content: '# Objectives & Key Results\n\n## Q1 OKRs\n\n## Progress',
        icon: '🎯',
        parentId: null
      },
      {
        title: 'Hiring',
        content: '# Hiring Pipeline\n\n## Open Positions\n\n## Interview Process',
        icon: '👔',
        parentId: null
      }
    ],
    'crm-system': [
      {
        title: 'CRM Dashboard',
        content: '# CRM Dashboard\n\n## Pipeline Overview\n\n## Recent Activity',
        icon: '📊',
        parentId: null
      },
      {
        title: 'Contacts',
        content: '# Contact Management\n\n## Key Accounts\n\n## Recent Contacts',
        icon: '👤',
        parentId: null
      },
      {
        title: 'Deals',
        content: '# Deal Pipeline\n\n## Active Deals\n\n## Closed Deals',
        icon: '💼',
        parentId: null
      },
      {
        title: 'Reports',
        content: '# Sales Reports\n\n## Monthly Performance\n\n## Forecasting',
        icon: '📈',
        parentId: null
      }
    ]
  };

  return templates[templateId] || [];
}

function getTemplateDatabases(templateId: string) {
  // Template database structures
  const databases: Record<string, any[]> = {
    'project-tracker': [
      {
        title: 'Tasks',
        icon: '✅',
        config: {
          properties: ['Status', 'Assignee', 'Priority', 'Due Date', 'Sprint']
        }
      },
      {
        title: 'Sprints',
        icon: '🏃',
        config: {
          properties: ['Sprint Name', 'Start Date', 'End Date', 'Goals', 'Status']
        }
      },
      {
        title: 'Team Members',
        icon: '👥',
        config: {
          properties: ['Name', 'Role', 'Email', 'Availability']
        }
      }
    ],
    'product-roadmap': [
      {
        title: 'Features',
        icon: '⭐',
        config: {
          properties: ['Feature Name', 'Priority', 'Status', 'Release', 'Owner']
        }
      },
      {
        title: 'Releases',
        icon: '🚀',
        config: {
          properties: ['Version', 'Release Date', 'Features', 'Notes']
        }
      }
    ],
    'marketing-campaign': [
      {
        title: 'Campaigns',
        icon: '📢',
        config: {
          properties: ['Campaign Name', 'Status', 'Budget', 'Start Date', 'End Date', 'ROI']
        }
      },
      {
        title: 'Content',
        icon: '📝',
        config: {
          properties: ['Title', 'Type', 'Status', 'Publish Date', 'Campaign', 'Author']
        }
      }
    ],
    'crm-system': [
      {
        title: 'Contacts Database',
        icon: '👤',
        config: {
          properties: ['Name', 'Company', 'Email', 'Phone', 'Status', 'Last Contact']
        }
      },
      {
        title: 'Deals Pipeline',
        icon: '💰',
        config: {
          properties: ['Deal Name', 'Value', 'Stage', 'Contact', 'Close Date', 'Probability']
        }
      },
      {
        title: 'Activities',
        icon: '📅',
        config: {
          properties: ['Type', 'Subject', 'Contact', 'Date', 'Status', 'Notes']
        }
      }
    ]
  };

  return databases[templateId] || [];
}

async function getTemplatePreview(templateId: string) {
  // Return preview data for the template
  return {
    pages: getTemplatePages(templateId),
    databases: getTemplateDatabases(templateId),
    structure: {
      totalPages: getTemplatePages(templateId).length,
      totalDatabases: getTemplateDatabases(templateId).length
    }
  };
}
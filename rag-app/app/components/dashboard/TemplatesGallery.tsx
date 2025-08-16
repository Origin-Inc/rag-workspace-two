// Task 12.9: Workspace templates gallery with preview and cloning
import React, { useState, useEffect } from 'react';
import { useFetcher } from '@remix-run/react';
import { 
  FileText, 
  Users, 
  Briefcase, 
  Target, 
  Code, 
  BookOpen,
  Rocket,
  Package,
  Settings,
  Copy,
  Eye,
  Check,
  Sparkles,
  TrendingUp,
  Calendar,
  Database,
  Layout
} from 'lucide-react';

interface WorkspaceTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  structure: {
    pages: number;
    databases: number;
    templates: number;
    automations: number;
  };
  usageCount: number;
  previewImage?: string;
  tags: string[];
}

const templateCategories = [
  { id: 'all', name: 'All Templates', icon: <FileText className="w-4 h-4" /> },
  { id: 'project', name: 'Project Management', icon: <Briefcase className="w-4 h-4" /> },
  { id: 'product', name: 'Product Development', icon: <Code className="w-4 h-4" /> },
  { id: 'marketing', name: 'Marketing', icon: <Target className="w-4 h-4" /> },
  { id: 'team', name: 'Team Collaboration', icon: <Users className="w-4 h-4" /> },
  { id: 'knowledge', name: 'Knowledge Base', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'startup', name: 'Startup', icon: <Rocket className="w-4 h-4" /> },
];

const templates: WorkspaceTemplate[] = [
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    category: 'project',
    description: 'Complete project management system with tasks, timelines, and team assignments',
    icon: <Briefcase className="w-8 h-8 text-blue-500" />,
    features: [
      'Task management database',
      'Sprint planning views',
      'Team dashboard',
      'Progress tracking',
      'Automated status updates'
    ],
    structure: {
      pages: 8,
      databases: 3,
      templates: 5,
      automations: 4
    },
    usageCount: 1247,
    tags: ['agile', 'scrum', 'tasks', 'teams']
  },
  {
    id: 'product-roadmap',
    name: 'Product Roadmap',
    category: 'product',
    description: 'Strategic product planning with feature prioritization and release management',
    icon: <Rocket className="w-8 h-8 text-purple-500" />,
    features: [
      'Feature backlog',
      'Release planning',
      'Priority matrix',
      'Stakeholder views',
      'Progress metrics'
    ],
    structure: {
      pages: 10,
      databases: 4,
      templates: 6,
      automations: 5
    },
    usageCount: 892,
    tags: ['roadmap', 'features', 'releases', 'planning']
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign Hub',
    category: 'marketing',
    description: 'Plan and execute marketing campaigns with content calendars and analytics',
    icon: <Target className="w-8 h-8 text-green-500" />,
    features: [
      'Content calendar',
      'Campaign tracker',
      'Social media planner',
      'Analytics dashboard',
      'Budget tracking'
    ],
    structure: {
      pages: 12,
      databases: 5,
      templates: 8,
      automations: 6
    },
    usageCount: 756,
    tags: ['marketing', 'campaigns', 'content', 'social']
  },
  {
    id: 'team-wiki',
    name: 'Team Wiki',
    category: 'knowledge',
    description: 'Centralized knowledge base for team documentation and resources',
    icon: <BookOpen className="w-8 h-8 text-indigo-500" />,
    features: [
      'Documentation structure',
      'FAQ section',
      'Onboarding guides',
      'Process documentation',
      'Search integration'
    ],
    structure: {
      pages: 15,
      databases: 2,
      templates: 10,
      automations: 2
    },
    usageCount: 1523,
    tags: ['wiki', 'documentation', 'knowledge', 'onboarding']
  },
  {
    id: 'startup-toolkit',
    name: 'Startup Toolkit',
    category: 'startup',
    description: 'Everything you need to launch and grow your startup',
    icon: <Sparkles className="w-8 h-8 text-yellow-500" />,
    features: [
      'Business model canvas',
      'Investor CRM',
      'OKR tracking',
      'Hiring pipeline',
      'Financial projections'
    ],
    structure: {
      pages: 20,
      databases: 8,
      templates: 12,
      automations: 10
    },
    usageCount: 634,
    tags: ['startup', 'business', 'growth', 'funding']
  },
  {
    id: 'crm-system',
    name: 'CRM System',
    category: 'team',
    description: 'Customer relationship management with sales pipeline and contact tracking',
    icon: <Users className="w-8 h-8 text-orange-500" />,
    features: [
      'Contact database',
      'Deal pipeline',
      'Activity tracking',
      'Email integration',
      'Reporting dashboard'
    ],
    structure: {
      pages: 14,
      databases: 6,
      templates: 7,
      automations: 8
    },
    usageCount: 982,
    tags: ['crm', 'sales', 'contacts', 'pipeline']
  }
];

interface TemplatesGalleryProps {
  workspaceId: string;
  onTemplateApplied?: () => void;
}

export function TemplatesGallery({ workspaceId, onTemplateApplied }: TemplatesGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<WorkspaceTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  
  const fetcher = useFetcher();
  const isCloning = fetcher.state === 'submitting';

  // Filter templates based on category and search
  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesCategory && matchesSearch;
  });

  const handleCloneTemplate = (template: WorkspaceTemplate) => {
    fetcher.submit(
      {
        action: 'clone_template',
        templateId: template.id,
        workspaceId,
        templateData: JSON.stringify({
          name: template.name,
          structure: template.structure,
          features: template.features
        })
      },
      { method: 'post', action: '/api/workspace-templates' }
    );

    // Show success feedback
    setCopiedTemplateId(template.id);
    setTimeout(() => {
      setCopiedTemplateId(null);
      onTemplateApplied?.();
    }, 2000);
  };

  const handlePreview = (template: WorkspaceTemplate) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Workspace Templates</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose from pre-built templates to quickly set up your workspace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {templateCategories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {category.icon}
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Templates grid */}
      <div className="p-6">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No templates found matching your criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-shadow duration-200"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    {template.icon}
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Users className="w-3 h-3" />
                      <span>{template.usageCount.toLocaleString()}</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {template.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {template.description}
                  </p>

                  {/* Template structure */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <FileText className="w-3 h-3" />
                      <span>{template.structure.pages} pages</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Database className="w-3 h-3" />
                      <span>{template.structure.databases} databases</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Layout className="w-3 h-3" />
                      <span>{template.structure.templates} templates</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Settings className="w-3 h-3" />
                      <span>{template.structure.automations} automations</span>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-1">
                      {template.features.slice(0, 3).map((feature, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-2 py-1 bg-gray-100 text-xs text-gray-600 rounded"
                        >
                          {feature}
                        </span>
                      ))}
                      {template.features.length > 3 && (
                        <span className="inline-block px-2 py-1 text-xs text-gray-500">
                          +{template.features.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePreview(template)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
                    <button
                      onClick={() => handleCloneTemplate(template)}
                      disabled={isCloning}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        copiedTemplateId === template.id
                          ? 'bg-green-500 text-white'
                          : 'bg-blue-500 text-white hover:bg-blue-600'
                      } ${isCloning ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {copiedTemplateId === template.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          Applied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Use Template
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && selectedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {selectedTemplate.icon}
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedTemplate.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedTemplate.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Template details */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">What's Included</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {selectedTemplate.structure.pages} Pages
                      </div>
                      <div className="text-xs text-gray-500">Pre-configured pages</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Database className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {selectedTemplate.structure.databases} Databases
                      </div>
                      <div className="text-xs text-gray-500">Data structures</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Layout className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {selectedTemplate.structure.templates} Templates
                      </div>
                      <div className="text-xs text-gray-500">Page templates</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Settings className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {selectedTemplate.structure.automations} Automations
                      </div>
                      <div className="text-xs text-gray-500">Workflow automations</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features list */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Key Features</h4>
                <ul className="space-y-2">
                  {selectedTemplate.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Tags */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Usage stats */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Used by {selectedTemplate.usageCount.toLocaleString()} teams
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    handleCloneTemplate(selectedTemplate);
                    setShowPreview(false);
                  }}
                  disabled={isCloning}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                  Use This Template
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
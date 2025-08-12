import { useState } from "react";
import {
  DocumentTextIcon,
  ChartBarIcon,
  CalendarIcon,
  ViewColumnsIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  CodeBracketIcon,
  PresentationChartLineIcon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

interface ProjectTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: React.ElementType;
  category: string;
  structure: any;
  preview_image?: string;
  use_count: number;
  is_public: boolean;
}

const DEFAULT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "kanban-board",
    name: "Kanban Board",
    slug: "kanban-board",
    description: "Track tasks and projects using a Kanban-style board with customizable columns",
    icon: ViewColumnsIcon,
    category: "productivity",
    structure: {
      columns: ["To Do", "In Progress", "Review", "Done"],
      default_view: "board",
      pages: [
        { title: "Project Overview", type: "document" },
        { title: "Task Board", type: "kanban_board" },
        { title: "Sprint Planning", type: "document" },
        { title: "Retrospectives", type: "document" },
      ],
    },
    use_count: 0,
    is_public: true,
  },
  {
    id: "documentation",
    name: "Documentation",
    slug: "documentation",
    description: "Organize your documentation, guides, and knowledge base",
    icon: DocumentTextIcon,
    category: "knowledge",
    structure: {
      folders: ["Getting Started", "API Reference", "Guides", "FAQ"],
      default_view: "list",
      pages: [
        { title: "README", type: "document", folder: "/" },
        { title: "Installation", type: "document", folder: "Getting Started" },
        { title: "Quick Start", type: "document", folder: "Getting Started" },
        { title: "API Overview", type: "document", folder: "API Reference" },
        { title: "Tutorials", type: "document", folder: "Guides" },
      ],
    },
    use_count: 0,
    is_public: true,
  },
  {
    id: "product-roadmap",
    name: "Product Roadmap",
    slug: "product-roadmap",
    description: "Plan and track product development with timeline views",
    icon: PresentationChartLineIcon,
    category: "planning",
    structure: {
      quarters: ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"],
      default_view: "timeline",
      pages: [
        { title: "Vision & Strategy", type: "document" },
        { title: "Feature Roadmap", type: "timeline" },
        { title: "Release Notes", type: "document" },
        { title: "Metrics Dashboard", type: "database" },
      ],
    },
    use_count: 0,
    is_public: true,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    slug: "meeting-notes",
    description: "Organize meeting notes, action items, and follow-ups",
    icon: ChatBubbleLeftRightIcon,
    category: "collaboration",
    structure: {
      folders: ["Daily Standups", "Weekly Syncs", "One-on-Ones", "Retrospectives"],
      default_view: "list",
      pages: [
        { title: "Meeting Template", type: "document", is_template: true },
        { title: "Action Items", type: "database" },
        { title: "Meeting Calendar", type: "calendar_view" },
      ],
    },
    use_count: 0,
    is_public: true,
  },
  {
    id: "research-project",
    name: "Research Project",
    slug: "research-project",
    description: "Collect and organize research materials, notes, and findings",
    icon: BeakerIcon,
    category: "research",
    structure: {
      folders: ["Literature Review", "Data Collection", "Analysis", "Reports"],
      default_view: "list",
      pages: [
        { title: "Research Proposal", type: "document" },
        { title: "Bibliography", type: "database" },
        { title: "Experiment Log", type: "database" },
        { title: "Findings", type: "document" },
      ],
    },
    use_count: 0,
    is_public: true,
  },
  {
    id: "software-project",
    name: "Software Development",
    slug: "software-project",
    description: "Manage software development with issue tracking and documentation",
    icon: CodeBracketIcon,
    category: "engineering",
    structure: {
      folders: ["Planning", "Development", "Testing", "Deployment"],
      default_view: "board",
      pages: [
        { title: "Technical Spec", type: "document", folder: "Planning" },
        { title: "Architecture", type: "document", folder: "Planning" },
        { title: "Issue Tracker", type: "kanban_board", folder: "Development" },
        { title: "Code Reviews", type: "database", folder: "Development" },
        { title: "Test Cases", type: "database", folder: "Testing" },
        { title: "Deployment Guide", type: "document", folder: "Deployment" },
      ],
    },
    use_count: 0,
    is_public: true,
  },
];

interface ProjectTemplatesProps {
  workspaceId: string;
  onSelectTemplate: (template: ProjectTemplate) => void;
  customTemplates?: ProjectTemplate[];
}

export function ProjectTemplates({
  workspaceId,
  onSelectTemplate,
  customTemplates = [],
}: ProjectTemplatesProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates];
  
  const categories = [
    { id: "all", name: "All Templates" },
    { id: "productivity", name: "Productivity" },
    { id: "knowledge", name: "Knowledge Base" },
    { id: "planning", name: "Planning" },
    { id: "collaboration", name: "Collaboration" },
    { id: "research", name: "Research" },
    { id: "engineering", name: "Engineering" },
    { id: "custom", name: "Custom" },
  ];

  const filteredTemplates = allTemplates.filter(template => {
    const matchesCategory = selectedCategory === "all" || 
                          template.category === selectedCategory ||
                          (selectedCategory === "custom" && !template.is_public);
    
    const matchesSearch = searchQuery === "" ||
                         template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose a Template</h2>
        <p className="text-gray-600">
          Start with a pre-built template or create your own custom structure
        </p>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${selectedCategory === category.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }
              `}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Blank Project Card */}
        <button
          onClick={() => onSelectTemplate({
            id: "blank",
            name: "Blank Project",
            slug: "blank",
            description: "Start with an empty project",
            icon: DocumentTextIcon,
            category: "blank",
            structure: {},
            use_count: 0,
            is_public: false,
          })}
          className="group relative bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 transition-colors"
        >
          <div className="flex flex-col items-center text-center">
            <div className="p-3 bg-gray-100 rounded-lg group-hover:bg-blue-50 transition-colors">
              <DocumentTextIcon className="h-8 w-8 text-gray-600 group-hover:text-blue-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Blank Project
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Start from scratch with an empty project
            </p>
          </div>
        </button>

        {/* Template Cards */}
        {filteredTemplates.map(template => {
          const Icon = template.icon;
          return (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className="group relative bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-all"
            >
              <div className="flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <Icon className="h-8 w-8 text-blue-600" />
                  </div>
                  {template.use_count > 0 && (
                    <span className="text-xs text-gray-500">
                      {template.use_count} uses
                    </span>
                  )}
                </div>
                
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  {template.name}
                </h3>
                
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {template.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    {template.category}
                  </span>
                  {template.structure.pages && (
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                      {template.structure.pages.length} pages
                    </span>
                  )}
                  {template.structure.folders && (
                    <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded">
                      {template.structure.folders.length} folders
                    </span>
                  )}
                </div>

                {!template.is_public && (
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                      Custom
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-600">No templates found</p>
          <p className="text-sm text-gray-500">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}
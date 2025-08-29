import { useState, useEffect } from 'react';
import { json, type LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { prisma } from '~/utils/db.server';
import { ReactWindowTable } from '~/components/database-block/ReactWindowTable';
import { InteractiveTutorial, TutorialTrigger } from '~/components/onboarding/InteractiveTutorial';
import { 
  HoverCard,
  SuccessAnimation,
  ErrorAnimation,
  AnimatedStatCard,
  MagicSparkle,
  AnimatedProgressBar,
  FloatingActionButton,
  ConfettiBurst
} from '~/components/animations/MicroInteractions';
import { SmartDefaultsService } from '~/services/smart-defaults.client';
import { SampleDataGenerator, SAMPLE_DATA_TEMPLATES } from '~/services/sample-data-generator.server';
import { 
  Sparkles, 
  Database, 
  Upload, 
  BarChart3, 
  Users,
  TrendingUp,
  Activity,
  Zap,
  Copy,
  Download
} from 'lucide-react';
import { cn } from '~/utils/cn';

export const loader: LoaderFunction = async () => {
  // Generate sample data for demo
  const demoData = {
    columns: SAMPLE_DATA_TEMPLATES[0].columns,
    rows: Array.from({ length: 50000 }, (_, i) => ({
      id: `row-${i}`,
      data: SAMPLE_DATA_TEMPLATES[0].columns.reduce((acc, col) => {
        acc[col.id] = `${col.name} ${i}`;
        return acc;
      }, {} as any)
    })),
    templates: SAMPLE_DATA_TEMPLATES,
    stats: {
      totalUsers: 1234,
      activeProjects: 42,
      dataProcessed: 98765,
      aiQueries: 5678
    }
  };
  
  return json(demoData);
};

export default function ProductionDemo() {
  const { columns, rows, templates, stats } = useLoaderData<typeof loader>();
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clipboardData, setClipboardData] = useState<string | null>(null);
  const [aiActive, setAiActive] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<any[]>([]);
  
  // Start clipboard monitoring
  useEffect(() => {
    const cleanup = SmartDefaultsService.startClipboardMonitoring((data) => {
      setClipboardData(data);
      setSmartSuggestions(prev => [{
        type: 'clipboard',
        message: 'CSV data detected in clipboard!',
        action: 'Import Now'
      }, ...prev]);
    });
    
    return cleanup;
  }, []);
  
  // Simulate progress
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(p => Math.min(100, p + 10));
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Check for first-time user
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('tutorial-completed');
    if (!hasSeenTutorial) {
      setTimeout(() => setShowTutorial(true), 1000);
    }
  }, []);
  
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    
    // Trigger confetti for successful import
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 100);
  };
  
  const handleAIQuery = () => {
    setAiActive(true);
    setTimeout(() => {
      setAiActive(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 2000);
  };
  
  const handleClipboardImport = () => {
    if (clipboardData) {
      try {
        const parsed = SmartDefaultsService.parseCSV(clipboardData);
        console.log('Parsed CSV:', parsed);
        setShowSuccess(true);
        setClipboardData(null);
      } catch (error) {
        setShowError(true);
        setTimeout(() => setShowError(false), 3000);
      }
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Tutorial */}
      {showTutorial && (
        <InteractiveTutorial
          autoStart={true}
          onComplete={() => setShowTutorial(false)}
          onSkip={() => setShowTutorial(false)}
        />
      )}
      
      {/* Success/Error animations */}
      <SuccessAnimation show={showSuccess} message="Action completed successfully!" />
      <ErrorAnimation show={showError} message="Something went wrong" onClose={() => setShowError(false)} />
      
      {/* Confetti */}
      <div className="fixed top-1/2 left-1/2 pointer-events-none z-50">
        <ConfettiBurst trigger={showConfetti} />
      </div>
      
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MagicSparkle active={aiActive}>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-blue-600" />
                  Production Demo
                </h1>
              </MagicSparkle>
              <span className="text-sm text-gray-500">50,000 rows • 60fps</span>
            </div>
            <div className="flex items-center gap-3">
              <TutorialTrigger />
              <button
                onClick={handleAIQuery}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                data-tutorial="ai-input"
              >
                <Zap className="w-4 h-4" />
                Ask AI
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Smart suggestions bar */}
      {(clipboardData || smartSuggestions.length > 0) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-4">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-800 dark:text-blue-300">
                Smart detection: CSV data found in clipboard
              </span>
              <button
                onClick={handleClipboardImport}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
              >
                Import Now
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-4 py-8">
        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <AnimatedStatCard
            label="Total Users"
            value={stats.totalUsers}
            change={23}
            icon={Users}
          />
          <AnimatedStatCard
            label="Active Projects"
            value={stats.activeProjects}
            change={15}
            icon={Database}
          />
          <AnimatedStatCard
            label="Data Processed"
            value={stats.dataProcessed}
            change={42}
            icon={Activity}
          />
          <AnimatedStatCard
            label="AI Queries"
            value={stats.aiQueries}
            change={68}
            icon={Zap}
          />
        </div>
        
        {/* Progress bar */}
        <div className="mb-8">
          <AnimatedProgressBar progress={progress} />
        </div>
        
        {/* Sample data templates */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Quick Start Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {templates.map((template: any) => (
              <HoverCard key={template.id} className="p-4 cursor-pointer" >
                <div 
                  onClick={() => handleTemplateSelect(template.id)}
                  data-tutorial="import-button"
                >
                  <div className="text-2xl mb-2">{template.icon}</div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {template.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {template.description}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded">
                      {template.rowCount} rows
                    </span>
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded">
                      AI Ready
                    </span>
                  </div>
                </div>
              </HoverCard>
            ))}
          </div>
        </div>
        
        {/* Virtual scrolling table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              High-Performance Virtual Table (50k rows)
            </h2>
            <div className="flex items-center gap-2" data-tutorial="view-switcher">
              <button className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded">
                Table
              </button>
              <button className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                Gallery
              </button>
              <button className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                Board
              </button>
              <button className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                Calendar
              </button>
            </div>
          </div>
          
          <div className="h-[600px]" data-tutorial="analytics-panel">
            <ReactWindowTable
              columns={columns}
              rows={rows}
              onCellEdit={(rowId, columnId, value) => {
                console.log('Edit:', { rowId, columnId, value });
              }}
            />
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Rendering 50,000 rows at 60fps with virtual scrolling
            </span>
            <div className="flex items-center gap-2" data-tutorial="share-button">
              <button className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                <Copy className="w-4 h-4" />
                Share
              </button>
              <button className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Floating action button */}
      <FloatingActionButton
        icon={Sparkles}
        onClick={() => setShowTutorial(true)}
      />
    </div>
  );
}
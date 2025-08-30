// Task 12.9: Templates page for workspace template gallery
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { requireAuthenticatedUser } from '~/services/auth/auth.server';
import { prisma } from '~/utils/db.server';
import { TemplatesGallery } from '~/components/dashboard/TemplatesGallery';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuthenticatedUser(request);
  
  // Get workspace details
  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId }
  });
  
  return json({
    user,
    workspaceId: user.workspaceId,
    workspaceName: workspace?.name || 'Workspace'
  });
}

export default function Templates() {
  const { user, workspaceId, workspaceName } = useLoaderData<typeof loader>();
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                <h1 className="text-xl font-semibold text-gray-900">
                  Workspace Templates
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {workspaceName}
              </span>
              <span className="text-sm text-gray-600">
                {user.email}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-8 px-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-8 mb-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-8 h-8" />
            <h2 className="text-3xl font-bold">Get Started Quickly</h2>
          </div>
          <p className="text-lg opacity-90 mb-6">
            Choose from our curated collection of workspace templates to jumpstart your projects.
            Each template includes pre-configured pages, database schemas, and workflows.
          </p>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">15+</span>
              <span className="opacity-90">Templates Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">5 min</span>
              <span className="opacity-90">Average Setup Time</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">100%</span>
              <span className="opacity-90">Customizable</span>
            </div>
          </div>
        </div>

        {/* Templates Gallery */}
        <TemplatesGallery workspaceId={workspaceId} />

        {/* CTA Section */}
        <div className="mt-12 bg-gray-100 rounded-lg p-8 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-3">
            Can't find what you're looking for?
          </h3>
          <p className="text-gray-600 mb-6">
            Create your own custom template or request one from our team.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/app/projects/new"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Custom Template
            </Link>
            <Link
              to="/app/settings"
              className="px-6 py-2 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Request Template
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
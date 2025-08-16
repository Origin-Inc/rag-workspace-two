// Task 12.9: Templates page for workspace template gallery
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { requireUser } from '~/services/auth/auth.server';
import { TemplatesGallery } from '~/components/dashboard/TemplatesGallery';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  // For now, using a hardcoded workspace ID - you should get this from the user's session or database
  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  
  return json({
    user,
    workspaceId
  });
}

export default function Templates() {
  const { user, workspaceId } = useLoaderData<typeof loader>();
  
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
                {user.email}
              </span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-8 h-8" />
                <h2 className="text-3xl font-bold">
                  Get Started with Templates
                </h2>
              </div>
              <p className="text-lg text-blue-100 max-w-2xl">
                Jump-start your workspace with professionally designed templates. 
                From project management to CRM systems, we have everything you need 
                to be productive from day one.
              </p>
            </div>
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-2xl font-bold mb-1">6+</div>
                <div className="text-sm text-blue-100">Templates Available</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <TemplatesGallery 
          workspaceId={workspaceId}
          onTemplateApplied={() => {
            // Could redirect or show a success message
            console.log('Template applied successfully!');
          }}
        />
        
        {/* Benefits section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Ready-to-Use Structure
            </h3>
            <p className="text-sm text-gray-600">
              Each template comes with pre-configured pages, databases, and workflows 
              tailored to specific use cases.
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Best Practices Built-In
            </h3>
            <p className="text-sm text-gray-600">
              Templates are designed following industry best practices, ensuring 
              you start with a solid foundation.
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4">
              <ArrowLeft className="w-6 h-6 text-purple-500 rotate-180" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Fully Customizable
            </h3>
            <p className="text-sm text-gray-600">
              Start with a template and make it your own. Every aspect can be 
              customized to fit your needs.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
import { type LoaderFunctionArgs, redirect } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { sessionStorage } from '~/services/auth/session.server';
import { DatabaseTable } from '~/components/database-block/DatabaseTable';
import { databaseBlockService } from '~/services/database-block.server';
import { AISidebar } from '~/components/ai-sidebar/AISidebar';

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  
  const userId = session.get("userId");
  const email = session.get("email");
  
  if (!userId) {
    return redirect("/auth/login-simple");
  }
  
  const user = { id: userId, email };
  
  // For demo purposes, create a test database block if it doesn't exist
  const testDatabaseBlockId = 'demo-database-block';
  
  // For demo purposes, use a test workspace ID (must be a valid UUID)
  // In a real app, this would come from the actual workspace context
  const testWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  
  // In a real app, you would get the database block from the page/block relationship
  // For now, we'll use a hardcoded ID for testing
  
  return {
    user,
    databaseBlockId: testDatabaseBlockId,
    workspaceId: testWorkspaceId
  };
}

export default function DatabaseDemo() {
  const { user, databaseBlockId, workspaceId } = useLoaderData<typeof loader>();

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Database Block Demo</h1>
        <p className="text-sm text-gray-600 mt-1">
          Testing the advanced database block with 50k+ row support, real-time collaboration, and AI-powered commands
        </p>
      </header>
      
      <main className="flex-1 overflow-hidden bg-gray-50 relative">
        <DatabaseTable
          databaseBlockId={databaseBlockId}
          userId={user.id}
          userName={user.email?.split('@')[0] || 'User'}
          className="h-full"
        />
        
        {/* AI Sidebar - positioned on the right side */}
        <AISidebar
          workspaceId={workspaceId}
          userId={user.id}
        />
      </main>
    </div>
  );
}
import { useState } from 'react';
import { json, LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { getUser } from '~/services/auth/auth.server';
import { prisma } from '~/utils/db.server';
import { ClientOnly } from '~/components/ClientOnly';
import { ChatSidebar } from '~/components/chat/ChatSidebar';
import { ChatSidebarStable } from '~/components/chat/ChatSidebarStable';

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get a test page for the user
  const page = await prisma.page.findFirst({
    where: {
      workspace: {
        userWorkspaces: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
    },
  });

  return json({ page, user });
};

// Different chat implementations to test
const ChatImplementations = {
  // 1. Minimal stable version (no Zustand, no file persistence)
  stable: {
    name: 'Stable (No Zustand)',
    component: ChatSidebarStable,
    description: 'Basic implementation without Zustand or complex state'
  },
  
  // 2. Original with Zustand but NO file loading
  originalNoLoad: {
    name: 'Original (No File Load)',
    component: function ChatSidebarNoFileLoad(props: any) {
      // Import original but comment out file loading useEffect
      const OriginalChat = ChatSidebar;
      return <OriginalChat {...props} skipFileLoad={true} />;
    },
    description: 'Original ChatSidebar with Zustand but file loading disabled'
  },
  
  // 3. Original with Zustand AND file loading
  originalFull: {
    name: 'Original (Full)',
    component: ChatSidebar,
    description: 'Full original implementation with all features'
  },
  
  // 4. Original with delayed file loading
  originalDelayed: {
    name: 'Original (Delayed Load)',
    component: function ChatSidebarDelayedLoad(props: any) {
      const OriginalChat = ChatSidebar;
      return <OriginalChat {...props} delayFileLoad={5000} />;
    },
    description: 'Original with 5 second delay on file loading'
  }
};

export default function TestChatDebug() {
  const { page, user } = useLoaderData<typeof loader>();
  const [selectedImpl, setSelectedImpl] = useState<keyof typeof ChatImplementations>('stable');
  const [showChat, setShowChat] = useState(false);
  const [renderCount, setRenderCount] = useState(0);

  if (!page) {
    return (
      <div className="p-8">
        <p className="text-red-600">No page found. Please create a page first.</p>
      </div>
    );
  }

  const ChatComponent = ChatImplementations[selectedImpl].component;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Chat Debug Tool</h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Test Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Page ID: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{page.id}</code>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Workspace ID: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{page.workspaceId}</code>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Render Count: <span className="font-mono text-red-600">{renderCount}</span>
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Select Implementation:</label>
              <div className="space-y-2">
                {Object.entries(ChatImplementations).map(([key, impl]) => (
                  <label key={key} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                    <input
                      type="radio"
                      name="implementation"
                      value={key}
                      checked={selectedImpl === key}
                      onChange={() => {
                        setShowChat(false);
                        setRenderCount(0);
                        setTimeout(() => {
                          setSelectedImpl(key as keyof typeof ChatImplementations);
                        }, 100);
                      }}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{impl.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{impl.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setRenderCount(0);
                  setShowChat(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={showChat}
              >
                Mount Chat
              </button>
              
              <button
                onClick={() => {
                  setShowChat(false);
                  setRenderCount(0);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                disabled={!showChat}
              >
                Unmount Chat
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Hard Refresh
              </button>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Console Monitor</h2>
          <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-xs h-32 overflow-y-auto">
            <div>Implementation: {ChatImplementations[selectedImpl].name}</div>
            <div>Status: {showChat ? 'MOUNTED' : 'UNMOUNTED'}</div>
            <div>Watch browser console for errors...</div>
            {showChat && <div className="text-yellow-400 mt-2">⚠️ Check browser console for React errors</div>}
          </div>
        </div>
      </div>
      
      {/* Render the selected chat implementation */}
      {showChat && (
        <ClientOnly fallback={null}>
          <div 
            key={selectedImpl} 
            onAnimationIteration={() => setRenderCount(c => c + 1)}
          >
            <ChatComponent
              pageId={page.id}
              workspaceId={page.workspaceId}
              onRender={() => setRenderCount(c => c + 1)}
            />
          </div>
        </ClientOnly>
      )}
    </div>
  );
}
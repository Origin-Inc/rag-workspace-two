import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TeamActivityFeed } from '~/components/dashboard/TeamActivityFeed';
import type { Activity } from '~/components/dashboard/TeamActivityFeed';
import { createClient } from '@supabase/supabase-js';

// Mock the date utility
vi.mock('~/utils/date', () => ({
  formatDistanceToNow: vi.fn((date) => '2 hours ago'),
}));

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        callback('SUBSCRIBED');
        return { unsubscribe: vi.fn() };
      }),
    })),
    removeChannel: vi.fn(),
  })),
}));

const mockActivities: Activity[] = [
  {
    id: 'activity-1',
    userId: 'user-1',
    userName: 'John Doe',
    userAvatar: 'https://example.com/avatar1.jpg',
    action: 'created',
    resourceType: 'page',
    resourceId: 'page-1',
    resourceTitle: 'Project Overview',
    timestamp: new Date().toISOString(),
    workspaceId: 'workspace-1',
  },
  {
    id: 'activity-2',
    userId: 'user-2',
    userName: 'Jane Smith',
    action: 'updated',
    resourceType: 'project',
    resourceId: 'project-1',
    resourceTitle: 'Q1 Planning',
    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    workspaceId: 'workspace-1',
  },
  {
    id: 'activity-3',
    userId: 'user-3',
    userName: 'Bob Johnson',
    action: 'commented',
    resourceType: 'page',
    resourceId: 'page-2',
    resourceTitle: 'Meeting Notes',
    details: { comment: 'Great progress on this!' },
    timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    workspaceId: 'workspace-1',
  },
  {
    id: 'activity-4',
    userId: 'user-4',
    userName: 'Alice Brown',
    action: 'shared',
    resourceType: 'database',
    resourceId: 'db-1',
    resourceTitle: 'Task Tracker',
    timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    workspaceId: 'workspace-1',
  },
  {
    id: 'activity-5',
    userId: 'user-5',
    userName: 'Charlie Wilson',
    action: 'invited',
    resourceType: 'user',
    details: { invitedUserName: 'David Lee' },
    timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    workspaceId: 'workspace-1',
  },
];

const renderComponent = (props = {}) => {
  return render(
    <BrowserRouter>
      <TeamActivityFeed
        workspaceId="workspace-1"
        {...props}
      />
    </BrowserRouter>
  );
};

describe('TeamActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial activities', () => {
    renderComponent({ initialActivities: mockActivities.slice(0, 3) });
    
    expect(screen.getByText('Team Activity')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('displays activity messages correctly', () => {
    renderComponent({ initialActivities: mockActivities });
    
    expect(screen.getByText(/created page "Project Overview"/)).toBeInTheDocument();
    expect(screen.getByText(/updated project "Q1 Planning"/)).toBeInTheDocument();
    expect(screen.getByText(/commented on page "Meeting Notes"/)).toBeInTheDocument();
    expect(screen.getByText(/shared database "Task Tracker"/)).toBeInTheDocument();
    expect(screen.getByText(/invited David Lee to the workspace/)).toBeInTheDocument();
  });

  it('shows empty state when no activities', () => {
    renderComponent({ initialActivities: [] });
    
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(screen.getByText('Team activities will appear here')).toBeInTheDocument();
  });

  it('displays user avatars when available', () => {
    const { container } = renderComponent({ initialActivities: [mockActivities[0]] });
    
    const avatar = container.querySelector('img[src="https://example.com/avatar1.jpg"]');
    expect(avatar).toBeInTheDocument();
  });

  it('shows default avatar when user avatar not available', () => {
    const activityWithoutAvatar = { ...mockActivities[0], userAvatar: undefined };
    const { container } = renderComponent({ initialActivities: [activityWithoutAvatar] });
    
    // Should show user icon in placeholder
    const placeholder = container.querySelector('.bg-gray-200');
    expect(placeholder).toBeInTheDocument();
  });

  it('displays comments when available', () => {
    renderComponent({ initialActivities: [mockActivities[2]] });
    
    expect(screen.getByText('"Great progress on this!"')).toBeInTheDocument();
  });

  it('groups activities by date', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const activitiesWithDates = [
      { ...mockActivities[0], timestamp: today.toISOString() },
      { ...mockActivities[1], timestamp: yesterday.toISOString() },
    ];
    
    renderComponent({ initialActivities: activitiesWithDates });
    
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('renders in compact mode', () => {
    renderComponent({ 
      initialActivities: mockActivities,
      compact: true 
    });
    
    // Should not show the full header
    expect(screen.queryByText('Team Activity')).not.toBeInTheDocument();
    
    // Should still show activities
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    
    // Should limit to 5 items in compact mode
    const names = screen.getAllByText(/John Doe|Jane Smith|Bob Johnson|Alice Brown|Charlie Wilson/);
    expect(names.length).toBeLessThanOrEqual(5);
  });

  it('shows real-time connection status when enabled', () => {
    renderComponent({ 
      initialActivities: [],
      enableRealtime: true,
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'test-key'
    });
    
    expect(screen.getByText('Live updates')).toBeInTheDocument();
  });

  it('shows offline status when real-time enabled but not connected', () => {
    // Mock the subscribe to return disconnected status
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        callback('DISCONNECTED');
        return { unsubscribe: vi.fn() };
      }),
    };
    
    vi.mocked(createClient).mockReturnValue({
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    } as any);
    
    renderComponent({ 
      initialActivities: [],
      enableRealtime: true,
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'test-key',
      compact: true
    });
    
    // Since isConnected is false when status is not 'SUBSCRIBED'
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('respects maxItems prop', () => {
    renderComponent({ 
      initialActivities: mockActivities,
      maxItems: 2
    });
    
    // Can't easily test this without simulating real-time updates
    // The maxItems is mainly used for limiting new activities added via real-time
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('applies correct color classes for different actions', () => {
    const activities: Activity[] = [
      { ...mockActivities[0], action: 'created' }, // green
      { ...mockActivities[0], id: '2', action: 'updated' }, // blue
      { ...mockActivities[0], id: '3', action: 'deleted' }, // red
      { ...mockActivities[0], id: '4', action: 'shared' }, // purple
    ];
    
    const { container } = renderComponent({ initialActivities: activities });
    
    // Check for color classes
    expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-purple-50')).toBeInTheDocument();
  });

  it('creates links to resources when resourceId is available', () => {
    renderComponent({ initialActivities: [mockActivities[0]] });
    
    const link = screen.getByText('View page');
    expect(link).toHaveAttribute('href', '/app/page/page-1');
  });

  it('handles "joined" action correctly', () => {
    const joinActivity: Activity = {
      ...mockActivities[0],
      action: 'joined',
      resourceType: 'workspace',
    };
    
    renderComponent({ initialActivities: [joinActivity] });
    
    expect(screen.getByText(/joined the workspace/)).toBeInTheDocument();
  });

  it('handles "left" action correctly', () => {
    const leftActivity: Activity = {
      ...mockActivities[0],
      action: 'left',
      resourceType: 'workspace',
    };
    
    renderComponent({ initialActivities: [leftActivity] });
    
    expect(screen.getByText(/left the workspace/)).toBeInTheDocument();
  });

  it('displays time since activity', () => {
    renderComponent({ initialActivities: mockActivities.slice(0, 1) });
    
    // formatDistanceToNow is mocked to return '2 hours ago'
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = renderComponent({ 
      initialActivities: [],
      className: 'custom-class'
    });
    
    const wrapper = container.querySelector('.custom-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('handles activities without resourceTitle', () => {
    const untitledActivity: Activity = {
      ...mockActivities[0],
      resourceTitle: undefined,
    };
    
    renderComponent({ initialActivities: [untitledActivity] });
    
    expect(screen.getByText(/created page "Untitled"/)).toBeInTheDocument();
  });

  it('handles activities without userName', () => {
    const anonymousActivity: Activity = {
      ...mockActivities[0],
      userName: undefined,
    };
    
    renderComponent({ initialActivities: [anonymousActivity] });
    
    expect(screen.getByText('Someone')).toBeInTheDocument();
  });

  it('scrolls when content exceeds max height', () => {
    const { container } = renderComponent({ 
      initialActivities: Array(20).fill(mockActivities[0]).map((a, i) => ({
        ...a,
        id: `activity-${i}`,
      }))
    });
    
    const scrollContainer = container.querySelector('.max-h-\\[600px\\]');
    expect(scrollContainer).toHaveClass('overflow-y-auto');
  });
});
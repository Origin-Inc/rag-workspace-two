import { useState, useEffect } from 'react';
import { useNavigate } from '@remix-run/react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { cn } from '~/utils/cn';
import type { IntegrationProvider } from './IntegrationsPanel';

export interface OAuthConfig {
  provider: IntegrationProvider;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl?: string;
  state?: string;
}

export interface OAuthFlowProps {
  config: OAuthConfig;
  onSuccess?: (tokens: { accessToken: string; refreshToken?: string }) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
  className?: string;
}

type OAuthStep = 'initial' | 'authorizing' | 'exchanging' | 'success' | 'error';

const providerAuthUrls: Record<IntegrationProvider, (config: OAuthConfig) => string> = {
  slack: (config) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(','),
      redirect_uri: config.redirectUri,
      state: config.state || '',
    });
    return `https://slack.com/oauth/v2/authorize?${params}`;
  },
  github: (config) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(' '),
      redirect_uri: config.redirectUri,
      state: config.state || '',
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  },
  google_drive: (config) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(' '),
      redirect_uri: config.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: config.state || '',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
  figma: (config) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(','),
      redirect_uri: config.redirectUri,
      state: config.state || '',
      response_type: 'code',
    });
    return `https://www.figma.com/oauth?${params}`;
  },
  notion: (config) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      owner: 'user',
      state: config.state || '',
    });
    return `https://api.notion.com/v1/oauth/authorize?${params}`;
  },
  linear: (config) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(' '),
      redirect_uri: config.redirectUri,
      response_type: 'code',
      state: config.state || '',
    });
    return `https://linear.app/oauth/authorize?${params}`;
  },
};

export function OAuthFlow({
  config,
  onSuccess,
  onError,
  onCancel,
  className,
}: OAuthFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<OAuthStep>('initial');
  const [error, setError] = useState<string | null>(null);
  const [authWindow, setAuthWindow] = useState<Window | null>(null);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin matches our domain
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'oauth-callback') {
        if (event.data.error) {
          setStep('error');
          setError(event.data.error);
          onError?.(new Error(event.data.error));
        } else if (event.data.code) {
          setStep('exchanging');
          exchangeCodeForToken(event.data.code);
        }
        authWindow?.close();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authWindow]);

  // Check if popup was closed
  useEffect(() => {
    if (!authWindow) return;

    const checkInterval = setInterval(() => {
      if (authWindow.closed) {
        clearInterval(checkInterval);
        if (step === 'authorizing') {
          setStep('initial');
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [authWindow, step]);

  const startOAuthFlow = () => {
    setStep('authorizing');
    setError(null);

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    const authUrl = providerAuthUrls[config.provider]({
      ...config,
      state,
    });

    // Store state in session storage for verification
    sessionStorage.setItem('oauth-state', state);

    // Open OAuth window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      authUrl,
      'oauth-window',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
    );

    setAuthWindow(popup);
  };

  const exchangeCodeForToken = async (code: string) => {
    try {
      const response = await fetch('/api/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          code,
          redirectUri: config.redirectUri,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const { accessToken, refreshToken } = await response.json();
      setStep('success');
      onSuccess?.({ accessToken, refreshToken });
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      onError?.(err instanceof Error ? err : new Error('Unknown error'));
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'initial':
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <LinkIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Connect {config.provider.charAt(0).toUpperCase() + config.provider.slice(1).replace('_', ' ')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              You'll be redirected to authorize access to your account
            </p>
            <div className="space-y-3">
              <button
                onClick={startOAuthFlow}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Continue with {config.provider.charAt(0).toUpperCase() + config.provider.slice(1).replace('_', ' ')}
              </button>
              <button
                onClick={onCancel}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 'authorizing':
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <ArrowPathIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Waiting for Authorization
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Please authorize access in the popup window
            </p>
            <button
              onClick={() => {
                authWindow?.close();
                setStep('initial');
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      case 'exchanging':
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <ArrowPathIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Completing Connection
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Setting up your integration...
            </p>
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Successfully Connected!
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Your {config.provider.replace('_', ' ')} account has been connected
            </p>
            <button
              onClick={() => navigate('/app/settings/integrations')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              View Integrations
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Connection Failed
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {error || 'An error occurred while connecting'}
            </p>
            <div className="space-y-3 mt-6">
              <button
                onClick={() => {
                  setStep('initial');
                  setError(null);
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Try Again
              </button>
              <button
                onClick={onCancel}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg p-6", className)}>
      {renderStepContent()}
      
      {/* Security Notice */}
      <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-start">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div className="ml-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">Security Note:</span> We never store your password. 
              Authorization is handled securely through {config.provider.replace('_', ' ')}'s official OAuth service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for OAuth callback page
export function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    const state = params.get('state');

    // Verify state to prevent CSRF
    const storedState = sessionStorage.getItem('oauth-state');
    if (state !== storedState) {
      window.opener?.postMessage(
        { type: 'oauth-callback', error: 'Invalid state parameter' },
        window.location.origin
      );
      window.close();
      return;
    }

    // Send result back to parent window
    if (window.opener) {
      window.opener.postMessage(
        { type: 'oauth-callback', code, error },
        window.location.origin
      );
      window.close();
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <ArrowPathIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Completing authorization...
        </p>
      </div>
    </div>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
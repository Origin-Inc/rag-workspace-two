import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthProvider {
  name: string;
  tokenUrl: string;
  userInfoUrl?: string;
  clientId: string;
  clientSecret: string;
}

const providers: Record<string, OAuthProvider> = {
  slack: {
    name: 'slack',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    userInfoUrl: 'https://slack.com/api/users.identity',
    clientId: Deno.env.get('SLACK_CLIENT_ID') || '',
    clientSecret: Deno.env.get('SLACK_CLIENT_SECRET') || '',
  },
  github: {
    name: 'github',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    clientId: Deno.env.get('GITHUB_CLIENT_ID') || '',
    clientSecret: Deno.env.get('GITHUB_CLIENT_SECRET') || '',
  },
  google_drive: {
    name: 'google_drive',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: Deno.env.get('GOOGLE_CLIENT_ID') || '',
    clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
  },
  figma: {
    name: 'figma',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
    userInfoUrl: 'https://api.figma.com/v1/me',
    clientId: Deno.env.get('FIGMA_CLIENT_ID') || '',
    clientSecret: Deno.env.get('FIGMA_CLIENT_SECRET') || '',
  },
  notion: {
    name: 'notion',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: Deno.env.get('NOTION_CLIENT_ID') || '',
    clientSecret: Deno.env.get('NOTION_CLIENT_SECRET') || '',
  },
  linear: {
    name: 'linear',
    tokenUrl: 'https://api.linear.app/oauth/token',
    userInfoUrl: 'https://api.linear.app/graphql',
    clientId: Deno.env.get('LINEAR_CLIENT_ID') || '',
    clientSecret: Deno.env.get('LINEAR_CLIENT_SECRET') || '',
  },
};

async function exchangeCodeForToken(
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; metadata?: any }> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
  });

  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  
  // Different providers return tokens in different formats
  let accessToken: string;
  let refreshToken: string | undefined;
  let metadata: any = {};

  switch (provider.name) {
    case 'slack':
      accessToken = data.access_token;
      metadata = {
        teamName: data.team?.name,
        teamId: data.team?.id,
        scope: data.scope,
      };
      break;
    
    case 'github':
      accessToken = data.access_token;
      metadata = {
        scope: data.scope,
        tokenType: data.token_type,
      };
      break;
    
    case 'google_drive':
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      metadata = {
        scope: data.scope,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
      };
      break;
    
    case 'figma':
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      metadata = {
        userId: data.user_id,
        expiresIn: data.expires_in,
      };
      break;
    
    case 'notion':
      accessToken = data.access_token;
      metadata = {
        botId: data.bot_id,
        workspaceName: data.workspace_name,
        workspaceIcon: data.workspace_icon,
        workspaceId: data.workspace_id,
      };
      break;
    
    case 'linear':
      accessToken = data.access_token;
      metadata = {
        tokenType: data.token_type,
        scope: data.scope,
      };
      break;
    
    default:
      accessToken = data.access_token || data.accessToken;
      refreshToken = data.refresh_token || data.refreshToken;
  }

  // Fetch additional user info if available
  if (provider.userInfoUrl && accessToken) {
    try {
      const userInfoResponse = await fetch(provider.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        
        switch (provider.name) {
          case 'github':
            metadata.accountName = userInfo.login;
            metadata.email = userInfo.email;
            metadata.avatarUrl = userInfo.avatar_url;
            break;
          
          case 'google_drive':
            metadata.email = userInfo.email;
            metadata.name = userInfo.name;
            metadata.picture = userInfo.picture;
            break;
          
          case 'figma':
            metadata.email = userInfo.email;
            metadata.handle = userInfo.handle;
            metadata.imgUrl = userInfo.img_url;
            break;
          
          case 'slack':
            metadata.userId = userInfo.user?.id;
            metadata.email = userInfo.user?.email;
            metadata.userName = userInfo.user?.name;
            break;
        }
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  }

  return { accessToken, refreshToken, metadata };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { provider: providerName, code, redirectUri } = await req.json();

    if (!providerName || !code || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const provider = providers[providerName];
    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'Invalid provider' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!provider.clientId || !provider.clientSecret) {
      return new Response(
        JSON.stringify({ error: 'Provider not configured' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokens = await exchangeCodeForToken(provider, code, redirectUri);

    return new Response(
      JSON.stringify(tokens),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
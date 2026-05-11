import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function getDiscordRedirectUri(nextAuthUrl: string) {
  return process.env.DISCORD_REDIRECT_URI?.trim() || `${nextAuthUrl}/api/auth/callback/discord`;
}

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/pt';
  return value;
}

// Iniciar OAuth do Discord
export async function GET(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  
  if (!clientId || !nextAuthUrl) {
    return Response.json(
      { error: 'Discord OAuth not configured' },
      { status: 500 }
    );
  }
  
  const redirectUri = getDiscordRedirectUri(nextAuthUrl);
  const frontendUrl = request.nextUrl.searchParams.get('frontendUrl') || process.env.NEXT_PUBLIC_FRONTEND_URL || '';
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('returnTo'));
  const state = Buffer.from(JSON.stringify({ frontendUrl, returnTo }), 'utf8').toString('base64url');

  const discordAuthUrl = new URL('https://discord.com/api/oauth2/authorize');
  discordAuthUrl.searchParams.set('client_id', clientId);
  discordAuthUrl.searchParams.set('redirect_uri', redirectUri);
  discordAuthUrl.searchParams.set('response_type', 'code');
  discordAuthUrl.searchParams.set('scope', 'identify email');
  discordAuthUrl.searchParams.set('state', state);

  return Response.redirect(discordAuthUrl.toString());
}

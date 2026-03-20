import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// Iniciar OAuth do Discord
export async function GET(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  
  console.log('[Discord Authorize] Variáveis:', {
    DISCORD_CLIENT_ID: clientId ? `✅ ${clientId.substring(0, 10)}...` : '❌ NÃO DEFINIDO',
    NEXTAUTH_URL: nextAuthUrl || '❌ NÃO DEFINIDO',
  });

  if (!clientId || !nextAuthUrl) {
    console.error('[Discord Authorize] ❌ Variáveis não configuradas!');
    return Response.json(
      { error: 'Discord OAuth not configured' },
      { status: 500 }
    );
  }
  
  const redirectUri = `${nextAuthUrl}/api/auth/callback/discord`;
  console.log('[Discord Authorize] Redirect URI:', redirectUri);

  const discordAuthUrl = new URL('https://discord.com/api/oauth2/authorize');
  discordAuthUrl.searchParams.set('client_id', clientId);
  discordAuthUrl.searchParams.set('redirect_uri', redirectUri);
  discordAuthUrl.searchParams.set('response_type', 'code');
  discordAuthUrl.searchParams.set('scope', 'identify email');

  return Response.redirect(discordAuthUrl.toString());
}

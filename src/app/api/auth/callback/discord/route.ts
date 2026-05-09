import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToken, generateRefreshToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type OAuthState = {
  frontendUrl?: string;
  returnTo?: string;
};

function getDiscordRedirectUri(nextAuthUrl: string) {
  return process.env.DISCORD_REDIRECT_URI?.trim() || `${nextAuthUrl}/api/auth/callback/discord`;
}

function decodeOAuthState(rawState: string | null): OAuthState {
  if (!rawState) return {};
  try {
    return JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
  } catch (error) {
    console.warn('[Discord Callback] Invalid OAuth state:', error);
    return {};
  }
}

function isAllowedFrontendUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === 'http:' || url.protocol === 'https:'
    ) && (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.p2ploot.com') ||
      host === 'p2ploot.com' ||
      host.endsWith('.p2ploot.com.br') ||
      host === 'p2ploot.com.br'
    );
  } catch {
    return false;
  }
}

function safeReturnPath(value?: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/pt';
  return value;
}

function buildFrontendRedirect(frontendUrl: string, returnTo: string, params: Record<string, string>) {
  const redirectUrl = new URL(safeReturnPath(returnTo), frontendUrl);
  Object.entries(params).forEach(([key, value]) => redirectUrl.searchParams.set(key, value));
  return redirectUrl;
}

// Função auxiliar para detectar URL do frontend
function getFrontendUrl(request: NextRequest, state: OAuthState = {}): string {
  if (isAllowedFrontendUrl(state.frontendUrl)) {
    console.log('[Discord Callback] Using frontend URL from OAuth state:', state.frontendUrl);
    return state.frontendUrl;
  }

  // Detectar dinamicamente a origem para facilitar testes locais em portas variadas
  const origin = request.headers.get('origin') || request.headers.get('referer');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const host = originUrl.host; // includes port
      const hostname = originUrl.hostname;
      
      const isLocal = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname.startsWith('192.168.') || 
                      hostname.startsWith('10.');

      if (isLocal) {
        const localFrontendUrl = `${originUrl.protocol}//${host}`;
        console.log('[Discord Callback] 🏠 Localhost detectado via Header, redirecionando para:', localFrontendUrl);
        return localFrontendUrl;
      }
    } catch (e) {
      // Ignorar erro de parsing de URL e seguir para fallback
    }
  }

  // Prioridade 1: Variável de ambiente
  const envUrl = process.env.NEXT_PUBLIC_FRONTEND_URL?.trim();
  if (envUrl) {
    console.log('[Discord Callback] ✅ Usando NEXT_PUBLIC_FRONTEND_URL:', envUrl);
    return envUrl;
  }

  // Prioridade 2: Detectar pelo hostname
  try {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const url = `${requestUrl.protocol}//${hostname}`;
      return url;
    }
  } catch (e) {}

  // Fallback final
  return 'http://localhost:6111';
}

// Callback do Discord OAuth
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = decodeOAuthState(searchParams.get('state'));
    const returnTo = safeReturnPath(state.returnTo);

    if (error) {
      console.error('[Discord Callback] Erro do Discord:', error);
      const frontendUrl = getFrontendUrl(request, state);
      return Response.redirect(
        buildFrontendRedirect(frontendUrl, returnTo, { error })
      );
    }

    if (!code) {
      console.error('[Discord Callback] Código não recebido');
      const frontendUrl = getFrontendUrl(request, state);
      return Response.redirect(
        buildFrontendRedirect(frontendUrl, returnTo, { error: 'no_code' })
      );
    }

    console.log('[Discord Callback] Código recebido, trocando por token...');

    // Verificar se variáveis estão configuradas
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    // IMPORTANTE: Secret do Discord pode ter espaço, NÃO usar trim() aqui
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();

    if (!clientId || !clientSecret || !nextAuthUrl) {
      throw new Error('Discord OAuth não configurado corretamente');
    }

    const redirectUri = getDiscordRedirectUri(nextAuthUrl);

    // Trocar code por access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Discord Callback] Erro ao trocar code:', tokenResponse.status, errorText);
      throw new Error(`Failed to exchange code for token: ${tokenResponse.status} - ${errorText}`);
    }

    console.log('[Discord Callback] Token recebido com sucesso');

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Buscar informações do usuário no Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const discordUser = await userResponse.json();

    // Buscar ou criar perfil
    let user = await prisma.profile.findFirst({
      where: { discordId: discordUser.id },
    });

    // Helper to get Discord creation date from ID (Snowflake)
    const getDiscordCreationDate = (snowflake: string) => {
      try {
        const DISCORD_EPOCH = 1420070400000;
        const id = BigInt(snowflake);
        const timestamp = (id >> 22n) + BigInt(DISCORD_EPOCH);
        return new Date(Number(timestamp));
      } catch (e) {
        console.error('[Discord Callback] Error parsing snowflake:', e);
        return new Date();
      }
    };

    const discordCreatedAt = getDiscordCreationDate(discordUser.id);

    if (!user) {
      // Verificar se email já existe
      if (discordUser.email) {
        const existingUser = await prisma.profile.findUnique({
          where: { email: discordUser.email },
        });

        if (existingUser) {
          // Vincular Discord ao perfil existente
          user = await prisma.profile.update({
            where: { id: existingUser.id },
            data: {
              discordId: discordUser.id,
              discordUsername: discordUser.username || null,
              discordGlobalName: discordUser.global_name || null,
              primaryAuthMethod: existingUser.walletAddress ? 'both' : 'discord',
              discordCreatedAt: discordCreatedAt, // New Field
              avatarUrl: discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                : existingUser.avatarUrl,
            },
          });
        }
      }

      // Se ainda não tem, criar novo
      if (!user) {
        user = await prisma.profile.create({
          data: {
            email: discordUser.email || null,
            username: discordUser.global_name || discordUser.username || 'Discord User',
            discordId: discordUser.id,
            discordUsername: discordUser.username || null,
            discordGlobalName: discordUser.global_name || null,
            primaryAuthMethod: 'discord',
            discordCreatedAt: discordCreatedAt, // New Field
            avatarUrl: discordUser.avatar
              ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
              : null,
            credits: 10.00,
            role: 'user',
          },
        });
      }
    } else {
      // Atualizar informações
      user = await prisma.profile.update({
        where: { id: user.id },
        data: {
          discordUsername: discordUser.username || user.discordUsername,
          discordGlobalName: discordUser.global_name || user.discordGlobalName,
          // Only update discordCreatedAt if missing (migration sake)
          discordCreatedAt: user.discordCreatedAt ? undefined : discordCreatedAt,
          avatarUrl: discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : user.avatarUrl,
        },
      });
    }

    // Verificar banimento por discordId OU email antes de gerar token
    const isBannedByDiscord = user.isBanned;
    const isBannedByEmail = !isBannedByDiscord && discordUser.email
      ? (await prisma.profile.findFirst({
          where: { email: discordUser.email, isBanned: true },
          select: { id: true }
        })) !== null
      : false;

    if (isBannedByDiscord || isBannedByEmail) {
      console.log('[Discord Callback] 🚫 Usuário banido tentou logar:', user.id);
      const frontendUrl = getFrontendUrl(request, state);
      return Response.redirect(
        buildFrontendRedirect(frontendUrl, returnTo, { error: 'permanently_banned' })
      );
    }

    // Gerar tokens
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    });

    // Detectar URL do frontend
    const frontendUrl = getFrontendUrl(request, state);
    const redirectUrl = buildFrontendRedirect(frontendUrl, returnTo, {
      token,
      refreshToken,
      discordLogin: 'true',
    });

    console.log('[Discord Callback] ✅ Sucesso! Redirecionando para:', redirectUrl.toString());

    return Response.redirect(redirectUrl);
  } catch (error) {
    console.error('[Discord Callback] ❌ Erro completo:', error);
    console.error('[Discord Callback] Stack:', error instanceof Error ? error.stack : 'N/A');

    // Detectar URL do frontend para erro também
    const state = decodeOAuthState(request.nextUrl.searchParams.get('state'));
    const frontendUrl = getFrontendUrl(request, state);
    const returnTo = safeReturnPath(state.returnTo);
    const errorMessage = error instanceof Error ? error.message : 'Failed to authenticate with Discord';

    console.log('[Discord Callback] Redirecionando para erro em:', frontendUrl);

    return Response.redirect(
      buildFrontendRedirect(frontendUrl, returnTo, { error: errorMessage })
    );
  }
}

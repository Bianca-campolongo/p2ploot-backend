import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToken, generateRefreshToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Função auxiliar para detectar URL do frontend
function getFrontendUrl(request: NextRequest): string {
  // Prioridade 1: Variável de ambiente (SEMPRE usar se definida - mesmo em dev para testes)
  const envUrl = process.env.NEXT_PUBLIC_FRONTEND_URL?.trim();
  if (envUrl) {
    console.log('[Discord Callback] ✅ Usando NEXT_PUBLIC_FRONTEND_URL:', envUrl);
    return envUrl;
  }

  // Prioridade 2: Detectar automaticamente pelo hostname da requisição
  try {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname;
    const isProduction = hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      !hostname.startsWith('192.168.') &&
      !hostname.startsWith('10.') &&
      hostname !== '';

    if (isProduction) {
      const url = `${requestUrl.protocol}//${hostname}`;
      console.log('[Discord Callback] ✅ Produção detectada pelo hostname, usando:', url);
      return url;
    } else {
      console.log('[Discord Callback] ⚠️ Ambiente de desenvolvimento detectado:', hostname);
    }
  } catch (e) {
    console.warn('[Discord Callback] ⚠️ Erro ao detectar URL:', e);
  }

  // Prioridade 3: Fallback desenvolvimento (APENAS se realmente não tiver variável definida)
  console.log('[Discord Callback] ⚠️ Usando fallback desenvolvimento: http://localhost:6111');
  console.log('[Discord Callback] ⚠️ ATENÇÃO: NEXT_PUBLIC_FRONTEND_URL não está definida!');
  return 'http://localhost:6111';
}

// Callback do Discord OAuth
export async function GET(request: NextRequest) {
  console.log('[Discord Callback] ========================================');
  console.log('[Discord Callback] Iniciando callback, URL:', request.url);
  console.log('[Discord Callback] Todas as variáveis de ambiente:');
  console.log('[Discord Callback] - DISCORD_CLIENT_ID:', process.env.DISCORD_CLIENT_ID ? `✅ ${process.env.DISCORD_CLIENT_ID.substring(0, 10)}...` : '❌ NÃO DEFINIDO');
  console.log('[Discord Callback] - DISCORD_CLIENT_SECRET:', process.env.DISCORD_CLIENT_SECRET ? `✅ Definido (${process.env.DISCORD_CLIENT_SECRET.length} chars)` : '❌ NÃO DEFINIDO');
  console.log('[Discord Callback] - NEXTAUTH_URL:', process.env.NEXTAUTH_URL || '❌ NÃO DEFINIDO');
  console.log('[Discord Callback] - NEXT_PUBLIC_FRONTEND_URL:', process.env.NEXT_PUBLIC_FRONTEND_URL || '❌ NÃO DEFINIDO');
  console.log('[Discord Callback] ========================================');

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('[Discord Callback] Erro do Discord:', error);
      const frontendUrl = getFrontendUrl(request);
      return Response.redirect(
        new URL(`/?error=${encodeURIComponent(error)}`, frontendUrl)
      );
    }

    if (!code) {
      console.error('[Discord Callback] Código não recebido');
      const frontendUrl = getFrontendUrl(request);
      return Response.redirect(
        new URL('/?error=no_code', frontendUrl)
      );
    }

    console.log('[Discord Callback] Código recebido, trocando por token...');

    // Verificar se variáveis estão configuradas
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    // IMPORTANTE: Secret do Discord pode ter espaço, NÃO usar trim() aqui
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();

    if (!clientId || !clientSecret || !nextAuthUrl) {
      console.error('[Discord Callback] Variáveis não configuradas:', {
        clientId: clientId ? `✅ (${clientId.substring(0, 10)}...)` : '❌ Não definido',
        clientSecret: clientSecret ? '✅ Definido' : '❌ Não definido',
        nextAuthUrl: nextAuthUrl || '❌ Não definido',
      });
      throw new Error('Discord OAuth não configurado corretamente');
    }

    const redirectUri = `${nextAuthUrl}/api/auth/callback/discord`;
    console.log('[Discord Callback] Credenciais:', {
      clientId: `${clientId.substring(0, 10)}...`,
      clientSecretLength: clientSecret.length,
      redirectUri: redirectUri,
    });

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
    const frontendUrl = getFrontendUrl(request);
    const redirectUrl = new URL(
      `/?token=${token}&refreshToken=${refreshToken}&discordLogin=true`,
      frontendUrl
    );

    console.log('[Discord Callback] ✅ Sucesso! Redirecionando para:', redirectUrl.toString());

    return Response.redirect(redirectUrl);
  } catch (error) {
    console.error('[Discord Callback] ❌ Erro completo:', error);
    console.error('[Discord Callback] Stack:', error instanceof Error ? error.stack : 'N/A');

    // Detectar URL do frontend para erro também
    const frontendUrl = getFrontendUrl(request);
    const errorMessage = error instanceof Error ? error.message : 'Failed to authenticate with Discord';

    console.log('[Discord Callback] Redirecionando para erro em:', frontendUrl);

    return Response.redirect(
      new URL(
        `/?error=${encodeURIComponent(errorMessage)}`,
        frontendUrl
      )
    );
  }
}

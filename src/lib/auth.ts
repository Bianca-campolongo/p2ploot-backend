import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from './prisma';

export interface AuthUser {
  id: string;
  email?: string | null;
  role: string;
  walletAddress?: string | null;
  // Moderator-specific permissions (only populated when role === 'moderator')
  panels?: string[];
  games?: string[];
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start safely.');
}
const jwtSecret = JWT_SECRET || 'dev-only-fallback-secret-do-not-use-in-production';

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

export function generateRefreshToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || jwtSecret,
    { expiresIn: '30d' }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthUser;
    return decoded;
  } catch (error) {
    return null;
  }
}

export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return null;
    }

    // Verificar se usuário ainda existe e está ativo
    const user = await prisma.profile.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        walletAddress: true,
        isBanned: true,
      },
    });

    if (!user) {
      return null;
    }

    if (user.isBanned) {
      return null;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    };

    // Inclui permissões de moderador no objeto de auth
    // Query separada com try/catch para ser resiliente a migration pendente
    if (user.role === 'moderator') {
      try {
        const modPerm = await prisma.moderatorPermission.findUnique({
          where: { userId: user.id },
        });
        if (modPerm) {
          authUser.panels = JSON.parse(modPerm.panels);
          authUser.games = JSON.parse(modPerm.games);
        } else {
          authUser.panels = [];
          authUser.games = ['all'];
        }
      } catch {
        // Tabela pode não existir em ambiente local sem migration
        authUser.panels = [];
        authUser.games = ['all'];
      }
    }

    return authUser;
  } catch (error) {
    console.error('Error getting auth user:', error);
    return null;
  }
}

export function requireAuth(handler: (req: NextRequest, user: AuthUser, context?: any) => Promise<Response>) {
  return async (req: NextRequest, context?: any) => {
    console.log('[Auth] requireAuth middleware hit for:', req.url);
    const user = await getAuthUser(req);

    if (!user) {
      console.log('[Auth] No user found for request:', req.url);
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Auth] User authenticated:', user.id);
    console.log('[Auth] Context passed:', context);

    return handler(req, user, context);
  };
}

export function requireRole(roles: string[]) {
  return (handler: (req: NextRequest, user: AuthUser, context?: any) => Promise<Response>) => {
    return requireAuth(async (req, user, context) => {
      if (!roles.includes(user.role)) {
        return Response.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }

      return handler(req, user, context);
    });
  };
}

/**
 * requirePanel — aceita admin OU moderador com o painel especificado liberado.
 * Uso nas rotas: substituir `if (user.role !== 'admin')` por este helper.
 */
export function requirePanel(panel: string) {
  return (handler: (req: NextRequest, user: AuthUser, context?: any) => Promise<Response>) => {
    return requireAuth(async (req, user, context) => {
      if (user.role === 'admin') {
        return handler(req, user, context);
      }

      if (user.role === 'moderator' && user.panels?.includes(panel)) {
        return handler(req, user, context);
      }

      return Response.json({ error: 'Forbidden' }, { status: 403 });
    });
  };
}

/**
 * getModeratorGameFilter — retorna um filtro Prisma de `game` para moderadores.
 * Retorna `undefined` para admin ou moderador com "all", e um filtro `{ in: [...] }`
 * para moderadores restritos a jogos específicos.
 */
export function getModeratorGameFilter(user: AuthUser): { in: string[] } | undefined {
  if (user.role === 'admin') return undefined;
  if (!user.games || user.games.includes('all')) return undefined;
  return { in: user.games };
}

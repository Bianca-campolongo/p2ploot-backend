import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { prisma } from './prisma';

export interface AuthUser {
  id: string;
  email?: string | null;
  role: string;
  walletAddress?: string | null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function generateRefreshToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
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
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    };
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
  return (handler: (req: NextRequest, user: AuthUser) => Promise<Response>) => {
    return requireAuth(async (req, user) => {
      if (!roles.includes(user.role)) {
        return Response.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }

      return handler(req, user);
    });
  };
}

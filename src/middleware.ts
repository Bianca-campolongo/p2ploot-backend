import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // CORS headers para todas as rotas API
  if (request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');

    // Lista de origens permitidas
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_FRONTEND_URL,
      'http://localhost:6111',
      'http://localhost:5173',
      'http://127.0.0.1:6111',
      'http://127.0.0.1:5173',
      'https://p2ploot.com',
      'https://www.p2ploot.com',
    ].filter(Boolean);

    // Verificar se a origem é permitida
    const isAllowedOrigin = origin && allowedOrigins.some(allowed =>
      origin === allowed || origin.includes('p2ploot.com')
    );

    // Handle preflight OPTIONS requests FIRST
    if (request.method === 'OPTIONS') {
      const preflightResponse = new NextResponse(null, { status: 200 });

      if (isAllowedOrigin) {
        preflightResponse.headers.set('Access-Control-Allow-Origin', origin!);
      } else if (!origin) {
        // Requisição sem origem (ex: Postman, curl) - permitir
        preflightResponse.headers.set('Access-Control-Allow-Origin', '*');
      }

      preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true');
      preflightResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      preflightResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
      preflightResponse.headers.set('Access-Control-Max-Age', '86400');

      return preflightResponse;
    }

    // Para requisições normais
    const response = NextResponse.next();

    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin!);
    } else if (!origin) {
      // Requisição sem origem (ex: chamada direta do servidor)
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};

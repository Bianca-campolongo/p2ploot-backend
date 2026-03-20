import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Durante o build, não tentar conectar ao banco
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return Response.json({
      status: 'ok',
      database: 'skipped',
      message: 'Build phase - database check skipped',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Testar conexão com banco apenas em runtime
    await prisma.$queryRaw`SELECT 1`;
    
    return Response.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return Response.json(
      {
        status: 'error',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

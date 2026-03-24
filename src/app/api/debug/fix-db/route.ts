import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const results: any[] = [];
    
    try {
        console.log('[FIX-DB] Starting safe schema synchronization...');

        // Helper to check if column exists
        const checkColumn = async (table: string, column: string) => {
            const res: any[] = await prisma.$queryRaw`
                SELECT COUNT(*) as count 
                FROM information_schema.columns 
                WHERE table_name = ${table} 
                AND column_name = ${column}
                AND table_schema = DATABASE()
            `;
            return Number(res[0].count) > 0;
        };

        // 1. Fix market_ads
        if (!(await checkColumn('market_ads', 'approved_at'))) {
            await prisma.$executeRaw`ALTER TABLE market_ads ADD COLUMN approved_at DATETIME(3) NULL`;
            results.push('Added market_ads.approved_at');
        }
        if (!(await checkColumn('market_ads', 'approved_by_id'))) {
            await prisma.$executeRaw`ALTER TABLE market_ads ADD COLUMN approved_by_id CHAR(36) NULL`;
            results.push('Added market_ads.approved_by_id');
        }

        // 2. Fix events
        if (!(await checkColumn('events', 'approved_at'))) {
            await prisma.$executeRaw`ALTER TABLE events ADD COLUMN approved_at DATETIME(3) NULL`;
            results.push('Added events.approved_at');
        }
        if (!(await checkColumn('events', 'approved_by_id'))) {
            await prisma.$executeRaw`ALTER TABLE events ADD COLUMN approved_by_id CHAR(36) NULL`;
            results.push('Added events.approved_by_id');
        }

        return NextResponse.json({
            status: 'SUCCESS',
            message: 'Schema synchronization complete',
            results
        });
    } catch (error: any) {
        console.error('[FIX-DB] Migration failed:', error);
        return NextResponse.json({
            status: 'FAILED',
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}

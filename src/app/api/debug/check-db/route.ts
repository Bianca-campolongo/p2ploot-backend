import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deepSerialize } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        console.log('[DEBUG] Connection check starting...');
        
        // 1. Connection Test
        const dbNow = await prisma.$queryRaw`SELECT NOW() as now`;
        
        // 2. Table Column Check (MarketAd)
        const marketAdCols = await prisma.$queryRaw`DESCRIBE market_ads`;
        
        // 3. User Auth (Self check)
        // Just checking if we can query some records
        const firstUser = await prisma.profile.findFirst({
            select: { id: true, username: true }
        });

        // 4. Data counts
        const [adCount, eventCount, profileCount] = await Promise.all([
            prisma.marketAd.count(),
            prisma.event.count(),
            prisma.profile.count()
        ]);

        return NextResponse.json(deepSerialize({
            dbStatus: 'CONNECTED',
            dbTime: dbNow,
            counts: {
                ads: adCount,
                events: eventCount,
                profiles: profileCount
            },
            firstUser: firstUser,
            market_ads_columns: marketAdCols,
            env: {
                DATABASE_URL_DEFINED: !!process.env.DATABASE_URL,
                NODE_ENV: process.env.NODE_ENV,
                NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
            }
        }));
    } catch (error: any) {
        console.error('[DEBUG] Connection check failed:', error);
        return NextResponse.json({
            dbStatus: 'FAILED',
            error: error.message,
            stack: error.stack,
            url_defined: !!process.env.DATABASE_URL
        }, { status: 500 });
    }
}

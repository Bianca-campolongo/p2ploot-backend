import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const eventSchema = z.object({
    name: z.string().min(1),
    defaultPoints: z.number().default(0).refine(n => !isNaN(n), { message: "Points must be a valid number" }),
    recurrence: z.string().default('once'),
    recurrenceDays: z.string().optional().nullable(),
    eventTime: z.string().optional().nullable(),
});

async function createEvent(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const data = eventSchema.parse(body);

        // Check Permissions
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });

        if (!guild || (guild.ownerId !== user.id && guild.ownerAddress !== user.id)) {
            // Check Admin role
            const member = await prisma.guildMember.findUnique({
                where: { guildId_memberId: { guildId, memberId: user.id } }
            });
            if (!member || member.role !== 'admin') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const newEvent = await prisma.guildDkpEventsConfig.create({
            data: {
                guildId,
                eventName: data.name,
                dkpAmount: data.defaultPoints,
                recurrence: data.recurrence,
                recurrenceDays: data.recurrenceDays,
                eventTime: data.eventTime,
            }
        });

        return NextResponse.json({
            ...newEvent,
            id: newEvent.id,
            name: newEvent.eventName, // Frontend expects 'name'
            default_points: newEvent.dkpAmount, // Map for frontend
            recurrence: newEvent.recurrence,
            recurrence_days: newEvent.recurrenceDays,
            event_time: newEvent.eventTime,
            guildId: newEvent.guildId.toString()
        });
    } catch (error) {
        console.error('Error creating DKP event:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function updateEvent(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const eventId = searchParams.get('eventId');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
        }

        const body = await req.json();
        const data = eventSchema.parse(body);

        // Check Permissions
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { ownerId: true, ownerAddress: true }
        });

        if (!guild || (guild.ownerId !== user.id && guild.ownerAddress !== user.id)) {
            const member = await prisma.guildMember.findUnique({
                where: { guildId_memberId: { guildId, memberId: user.id } }
            });
            if (!member || member.role !== 'admin') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const updatedEvent = await prisma.guildDkpEventsConfig.update({
            where: { id: eventId },
            data: {
                eventName: data.name,
                dkpAmount: data.defaultPoints,
                recurrence: data.recurrence,
                recurrenceDays: data.recurrenceDays,
                eventTime: data.eventTime,
            }
        });

        return NextResponse.json({
            ...updatedEvent,
            id: updatedEvent.id,
            name: updatedEvent.eventName,
            default_points: updatedEvent.dkpAmount,
            recurrence: updatedEvent.recurrence,
            recurrence_days: updatedEvent.recurrenceDays,
            event_time: updatedEvent.eventTime,
            guildId: updatedEvent.guildId.toString()
        });
    } catch (error) {
        console.error('Error updating DKP event:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function deleteEvent(req: NextRequest, user: any, params: { id: string }) {
    // Note: Delete requires the EVENT ID, but this route is .../dkp/events
    // We should probably use DELETE with body or query param? 
    // Or make .../dkp/events/[eventId].
    // Simplest: DELETE handler here takes body or query param.
    // REST standard: DELETE /api/guilds/[id]/dkp/events?eventId=XYZ

    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const eventId = searchParams.get('eventId');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
        }

        // Check Permissions (same as create)
        const member = await prisma.guildMember.findUnique({
            where: { guildId_memberId: { guildId, memberId: user.id } }
        });
        // Owner check fallback needed if not in member table? Assuming permissions logic holds.
        const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { ownerId: true, ownerAddress: true } });
        const isOwner = guild && (guild.ownerId === user.id || guild.ownerAddress === user.id);
        const isAdmin = member?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await prisma.guildDkpEventsConfig.delete({
            where: { id: eventId } // ID is UUID, unique globally
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error deleting event:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => createEvent(r, user, context.params))(req);

export const PATCH = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => updateEvent(r, user, context.params))(req);

export const DELETE = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => deleteEvent(r, user, context.params))(req);

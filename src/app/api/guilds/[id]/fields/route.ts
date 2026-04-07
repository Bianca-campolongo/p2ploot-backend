import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGuildManager } from '@/lib/guildAuth';
import { z } from 'zod';

const fieldSchema = z.object({
    fieldName: z.string().min(1),
    fieldType: z.enum(['text', 'number', 'select']).default('text'),
    isRequired: z.boolean().default(false),
    displayOrder: z.number().int().optional(),
    options: z.array(z.string()).optional(),
});

// GET - List custom fields
async function listFields(req: NextRequest, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);

        const fields = await prisma.guildCustomField.findMany({
            where: { guildId },
            orderBy: { fieldOrder: 'asc' }
        });

        const serialized = fields.map((f: any) => ({
            ...f,
            guildId: f.guildId.toString()
        }));

        return NextResponse.json({ fields: serialized });
    } catch (error) {
        console.error('Error fetching fields:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Create custom field
async function createField(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const data = fieldSchema.parse(body);

        // Permission check — includes pilots with guildRole='admin'
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Only owner and admins can manage fields' }, { status: 403 });
        }

        // Get next display order
        const maxOrder = await prisma.guildCustomField.aggregate({
            where: { guildId },
            _max: { fieldOrder: true }
        });
        const nextOrder = (maxOrder._max?.fieldOrder || 0) + 1;

        const field = await prisma.guildCustomField.create({
            data: {
                guildId,
                fieldName: data.fieldName,
                fieldType: data.fieldType,
                isRequired: data.isRequired,
                fieldOrder: data.displayOrder ?? nextOrder,
                options: data.options ?? []
            }
        });

        return NextResponse.json({
            ...field,
            guildId: field.guildId.toString()
        });
    } catch (error: any) {
        console.error('Error creating field:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Remove custom field
async function deleteField(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const fieldId = searchParams.get('fieldId');

        if (!fieldId) {
            return NextResponse.json({ error: 'Field ID required' }, { status: 400 });
        }

        // Permission check — includes pilots with guildRole='admin'
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Only owner and admins can manage fields' }, { status: 403 });
        }

        await prisma.guildCustomField.delete({
            where: { id: fieldId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting field:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT - Reorder fields (batch update)
async function reorderFields(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const body = await req.json();
        const { fields } = body; // Array of { id, displayOrder }

        if (!Array.isArray(fields)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        // Permission check — includes pilots with guildRole='admin'
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Only owner and admins can manage fields' }, { status: 403 });
        }

        await prisma.$transaction(
            fields.map((f: { id: string; displayOrder: number }) =>
                prisma.guildCustomField.update({
                    where: { id: f.id },
                    data: { fieldOrder: f.displayOrder }
                })
            )
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error reordering fields:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH - Update custom field
async function updateField(req: NextRequest, user: any, params: { id: string }) {
    try {
        const guildId = BigInt(params.id);
        const { searchParams } = new URL(req.url);
        const fieldId = searchParams.get('fieldId');
        
        if (!fieldId) {
            return NextResponse.json({ error: 'Field ID required' }, { status: 400 });
        }

        const body = await req.json();
        
        // Pode atualizar parcialmente
        const updateSchema = z.object({
            fieldName: z.string().min(1).optional(),
            fieldType: z.enum(['text', 'number', 'select']).optional(),
            isRequired: z.boolean().optional(),
            options: z.array(z.string()).optional()
        });

        const data = updateSchema.parse(body);

        // Permission check — includes pilots with guildRole='admin'
        const hasAccess = await isGuildManager(guildId, user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Only owner and admins can manage fields' }, { status: 403 });
        }

        const updatedField = await prisma.guildCustomField.update({
            where: { id: fieldId, guildId }, // Garante que pertence à guilda
            data: {
                ...(data.fieldName !== undefined && { fieldName: data.fieldName }),
                ...(data.fieldType !== undefined && { fieldType: data.fieldType }),
                ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
                ...(data.options !== undefined && { options: data.options })
            }
        });

        return NextResponse.json({
            ...updatedField,
            guildId: updatedField.guildId.toString()
        });
    } catch (error: any) {
        console.error('Error updating field:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
    return listFields(req, context.params);
}

export const POST = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => createField(r, user, context.params))(req);

export const DELETE = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => deleteField(r, user, context.params))(req);

export const PUT = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => reorderFields(r, user, context.params))(req);

export const PATCH = (req: NextRequest, context: { params: { id: string } }) =>
    requireAuth((r: NextRequest, user: any) => updateField(r, user, context.params))(req);

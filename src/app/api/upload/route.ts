import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth';

const s3Client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true, // Necessário para o MinIO local
});

async function handleUpload(req: NextRequest, user: any) {
    try {
        // Validação obrigatória de variáveis de ambiente do S3
        const requiredEnvVars = [
            'S3_ENDPOINT', 
            'S3_REGION', 
            'S3_ACCESS_KEY_ID', 
            'S3_SECRET_ACCESS_KEY', 
            'S3_BUCKET_NAME', 
            'S3_PUBLIC_URL'
        ];
        
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Configuração do servidor ausente. A variável de ambiente ${envVar} é obrigatória e não foi encontrada.`);
            }
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }

        // --- BEGIN SECURITY VALIDATION ---

        // 1. Validate File Size (Max 5MB)
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'Arquivo muito grande. O tamanho máximo é 5MB.' }, { status: 400 });
        }

        // 2. Validate MIME Type
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: 'Tipo de arquivo inválido. Apenas JPG, PNG, WEBP e GIF são permitidos.' }, { status: 400 });
        }

        // --- END SECURITY VALIDATION ---

        // Filename único
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Sanitizar filename para prevenir path traversal
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '');
        const filename = `${uniqueSuffix}-${safeName}`;
        
        // Pasta /images como requerido
        const key = `images/${filename}`;

        // Buffer file
        const buffer = Buffer.from(await file.arrayBuffer());

        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: file.type,
            // ACL foi removido pois baldes R2 e melhores práticas do S3 usam bucket policies (como fizemos no MinIO via mc)
        });

        await s3Client.send(command);

        // URL pública montada com base na configuração do ambiente
        const publicUrlBase = process.env.S3_PUBLIC_URL?.replace(/\/$/, ""); // Remove slash final se existir
        const url = `${publicUrlBase}/${key}`;

        return NextResponse.json({ url });

    } catch (error: any) {
        console.error('Falha no upload do arquivo:', error);
        return NextResponse.json({ error: error.message || 'O upload falhou devido a um erro no servidor' }, { status: 500 });
    }
}

export const POST = (req: NextRequest) => requireAuth(handleUpload)(req);

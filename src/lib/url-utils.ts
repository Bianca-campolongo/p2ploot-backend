/**
 * Normaliza URLs de imagem, removendo referências a localhost em produção
 * e garantindo que caminhos relativos funcionem corretamente.
 */
export function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    
    // Se for uma URL do Vercel Blob ou external HTTPS, mantém
    if (url.startsWith('https://')) return url;
    
    // Se contiver localhost, tenta extrair o caminho relativo
    if (url.includes('localhost:6110')) {
        const uploadsIndex = url.indexOf('/uploads/');
        if (uploadsIndex !== -1) {
            return url.substring(uploadsIndex);
        }
        // Se não tiver uploads mas for localhost, provavelmente é um erro de dados
        return null;
    }
    
    // Se já for um caminho relativo, mantém
    if (url.startsWith('/')) return url;
    
    return url;
}

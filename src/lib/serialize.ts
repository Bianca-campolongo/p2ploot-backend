import { normalizeImageUrl } from './url-utils';

// Production Polyfill to ensure JSON.stringify never fails on BigInt
if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
    (BigInt.prototype as any).toJSON = function () {
        return this.toString();
    };
}

/**
 * Robustly serializes objects for JSON responses.
 * Handles BigInt, Decimal, Dates, and image URL normalization.
 */
export function deepSerialize(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    // 1. Safe JSON stringify with replacer for types that throw
    let stringified: string;
    try {
        stringified = JSON.stringify(obj, (key, value) => {
            // BigInt -> string (Backup for toJSON above)
            if (typeof value === 'bigint') return value.toString();
            
            // Decimal -> number
            if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
                try {
                    return value.toNumber();
                } catch (e) {
                    return value.toString();
                }
            }

            // Normalize Image URLs if we find them during stringification
            if (typeof value === 'string' && (
                key === 'imageUrl' || 
                key === 'image_url' || 
                key === 'avatarUrl' || 
                key === 'avatar_url' || 
                key === 'icon_url'
            )) {
                return normalizeImageUrl(value);
            }

            return value;
        });
    } catch (e) {
        console.error('[deepSerialize] First pass failed:', e);
        return obj;
    }

    // 2. Parse back to a plain object
    const result = JSON.parse(stringified);

    // 3. Post-process to add compatibility aliases (snake_case)
    return addCompatibilityAliases(result);
}

/**
 * Recursively adds snake_case aliases for common fields used by the frontend.
 */
function addCompatibilityAliases(obj: any, depth = 0): any {
    if (depth > 10 || obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => addCompatibilityAliases(item, depth + 1));
    }

    const newObj: any = { ...obj };
    
    // Ensure ID is always a string for BigInt IDs
    if (obj.id && typeof obj.id === 'number') newObj.id = obj.id.toString();
    if (obj.id && typeof obj.id === 'bigint') newObj.id = obj.id.toString();
    
    // Core property mapping
    if (obj.ownerId) newObj.owner_id = obj.ownerId;
    if (obj.gameId) newObj.game_id = obj.gameId;
    if (obj.imageUrl) newObj.image_url = obj.imageUrl;
    if (obj.avatarUrl) newObj.avatar_url = obj.avatarUrl;
    if (obj.createdAt) newObj.created_at = obj.createdAt;
    if (obj.updatedAt) newObj.updated_at = obj.updatedAt;
    if (obj.accessExpiresAt) newObj.access_expires_at = obj.accessExpiresAt;
    
    // DKP Settings mapping
    if (obj.dkpConfig) newObj.dkp_config = obj.dkpConfig;
    if (obj.dkpDecayActive !== undefined) newObj.dkp_decay_active = obj.dkpDecayActive;
    if (obj.dkpDecayPercent !== undefined) newObj.dkp_decay_percent = obj.dkpDecayPercent;
    if (obj.dkpDecayInterval) newObj.dkp_decay_interval = obj.dkpDecayInterval;
    if (obj.dkpDecayDay !== undefined) newObj.dkp_decay_day = obj.dkpDecayDay;
    if (obj.dkpRoleBonuses) newObj.dkp_role_bonuses = obj.dkpRoleBonuses;
    if (obj.dkpEventsConfig) newObj.dkp_events_config = obj.dkpEventsConfig;
    
    // Discord Profile mapping
    if (obj.discordId) newObj.discord_id = obj.discordId;
    if (obj.discordUsername) newObj.discord_username = obj.discordUsername;
    if (obj.discordGlobalName) newObj.discord_global_name = obj.discordGlobalName;
    
    // Handle Prisma _count mappings
    if (obj._count) {
        if (typeof obj._count.members !== 'undefined') newObj.members_count = obj._count.members;
        if (typeof obj._count.memberships !== 'undefined') newObj.members_count = obj._count.memberships;
    }

    // Recurse into nested objects
    for (const key in newObj) {
        // Skip recursing back into what we just added
        if (key === 'owner_id' || key === 'game_id' || key === 'image_url' || key === 'avatar_url' || key === 'created_at' || key === 'updated_at' || key === 'members_count') {
            continue;
        }
        
        if (newObj[key] && typeof newObj[key] === 'object') {
            newObj[key] = addCompatibilityAliases(newObj[key], depth + 1);
        }
    }

    return newObj;
}






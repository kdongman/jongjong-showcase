import type {
  CouplePet,
  PetBoothPoseKey,
  PetInventoryItem,
} from './companions/couplePetBoothAdapter';
import {
  parsePetGrowthStage,
  progressFromTotalXp,
  resolvePetSpecies,
} from './companions/couplePetBoothAdapter';
import { supabase } from '../../lib/supabase';

function mapPet(row: Record<string, unknown>): CouplePet {
  const xp = Number(row.xp ?? 0);
  const derived = progressFromTotalXp(xp);
  const catalogKey = String(row.catalog_key);
  const resolved = resolvePetSpecies({ catalogKey });
  return {
    id: String(row.id),
    coupleId: String(row.couple_id),
    catalogKey,
    species: resolved.species ?? 'dog',
    speciesSource: resolved.source,
    name: String(row.name),
    xp,
    level: Number(row.level ?? derived.level),
    growthStage: parsePetGrowthStage(row.growth_stage) ?? derived.stage,
    equippedSkinKey: row.equipped_skin_key ? String(row.equipped_skin_key) : null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function withSpecies(pet: CouplePet): Promise<CouplePet> {
  const { data } = await supabase.from('pet_catalog').select('species').eq('key', pet.catalogKey).maybeSingle();
  if (data == null) {
    const inferred = resolvePetSpecies({ catalogKey: pet.catalogKey });
    return { ...pet, species: inferred.species ?? pet.species, speciesSource: inferred.source };
  }
  const resolved = resolvePetSpecies({ species: data.species, catalogKey: pet.catalogKey });
  if (resolved.source === 'invalid') {
    return { ...pet, species: pet.species, speciesSource: 'invalid' };
  }
  if (resolved.species) {
    return { ...pet, species: resolved.species, speciesSource: 'catalog' };
  }
  return { ...pet, species: pet.species, speciesSource: resolved.source };
}

export async function fetchActiveCouplePet(coupleId: string | null | undefined): Promise<CouplePet | null> {
  if (!coupleId || coupleId === 'null') return null;
  const { data, error } = await supabase
    .from('couple_pets')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: anyPet, error: anyError } = await supabase
      .from('couple_pets')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyError) throw anyError;
    if (!anyPet) return null;
    return withSpecies(mapPet(anyPet as Record<string, unknown>));
  }
  return withSpecies(mapPet(data as Record<string, unknown>));
}

export async function fetchCouplePets(coupleId: string | null | undefined): Promise<CouplePet[]> {
  if (!coupleId || coupleId === 'null') return [];
  const { data, error } = await supabase
    .from('couple_pets')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Promise.all((data ?? []).map((row) => withSpecies(mapPet(row as Record<string, unknown>))));
}

export async function fetchPetInventory(petId: string | null | undefined): Promise<PetInventoryItem[]> {
  if (!petId || petId === 'null') return [];
  const { data, error } = await supabase
    .from('couple_pet_inventory')
    .select('id, couple_id, pet_id, item_key, source, acquired_at')
    .eq('pet_id', petId)
    .order('acquired_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    coupleId: String(row.couple_id),
    petId: String(row.pet_id),
    itemKey: String(row.item_key),
    source: row.source as PetInventoryItem['source'],
    acquiredAt: String(row.acquired_at),
  }));
}

export function inventoryPoseKeys(inventory: PetInventoryItem[]): PetBoothPoseKey[] {
  return inventory
    .filter((item) => item.itemKey.startsWith('pose_'))
    .map((item) => item.itemKey.replace(/^pose_/, '') as PetBoothPoseKey);
}

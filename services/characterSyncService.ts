import { Character, EpisodeCharacterRef, Episode, SeriesProject } from '../types';

export interface SyncCheckResult {
  outdatedRefs: EpisodeCharacterRef[];
  missingInLibrary: EpisodeCharacterRef[];
}

export function checkCharacterSync(
  episode: Episode,
  project: SeriesProject
): SyncCheckResult {
  const outdatedRefs: EpisodeCharacterRef[] = [];
  const missingInLibrary: EpisodeCharacterRef[] = [];

  for (const ref of episode.characterRefs || []) {
    if (ref.syncStatus === 'local-only') continue;

    const libChar = project.characterLibrary.find(c => c.id === ref.characterId);
    if (!libChar) {
      missingInLibrary.push(ref);
      continue;
    }

    const libVersion = libChar.version || 1;
    if (libVersion > ref.syncedVersion) {
      outdatedRefs.push(ref);
    }
  }

  return { outdatedRefs, missingInLibrary };
}

export function syncCharacter(
  episode: Episode,
  project: SeriesProject,
  characterId: string
): Episode {
  const libChar = project.characterLibrary.find(c => c.id === characterId);
  if (!libChar || !episode.scriptData) return episode;

  const libVersion = libChar.version || 1;

  const newCharacters = episode.scriptData.characters.map(c => {
    if (c.libraryId !== characterId) return c;
    return {
      ...libChar,
      id: c.id,
      libraryId: characterId,
      libraryVersion: libVersion,
      variations: c.variations,
    };
  });

  const newRefs = (episode.characterRefs || []).map(r => {
    if (r.characterId !== characterId) return r;
    return { ...r, syncedVersion: libVersion, syncStatus: 'synced' as const };
  });

  return {
    ...episode,
    scriptData: { ...episode.scriptData, characters: newCharacters },
    characterRefs: newRefs,
  };
}

export function syncAllCharacters(
  episode: Episode,
  project: SeriesProject
): Episode {
  const { outdatedRefs } = checkCharacterSync(episode, project);
  let updated = episode;
  for (const ref of outdatedRefs) {
    updated = syncCharacter(updated, project, ref.characterId);
  }
  return updated;
}

export function promoteCharacterToLibrary(
  character: Character,
  project: SeriesProject
): { updatedProject: SeriesProject; libraryCharacterId: string } {
  const existing = project.characterLibrary.find(c => c.id === character.libraryId);

  if (existing) {
    const updatedLibrary = project.characterLibrary.map(c =>
      c.id === existing.id ? { ...character, id: existing.id, version: (existing.version || 0) + 1, libraryId: undefined, libraryVersion: undefined } : c
    );
    return {
      updatedProject: { ...project, characterLibrary: updatedLibrary, lastModified: Date.now() },
      libraryCharacterId: existing.id,
    };
  }

  const libChar: Character = {
    ...character,
    libraryId: undefined,
    libraryVersion: undefined,
    version: 1,
  };
  return {
    updatedProject: { ...project, characterLibrary: [...project.characterLibrary, libChar], lastModified: Date.now() },
    libraryCharacterId: libChar.id,
  };
}

import { ScriptData, SeriesProject, Character, Scene, Prop, Shot, EpisodeCharacterRef } from '../types';

export interface AssetMatchItem<T> {
  aiAsset: T;
  libraryAsset: T | null;
  reuse: boolean;
}

export interface AssetMatchResult {
  characters: AssetMatchItem<Character>[];
  scenes: AssetMatchItem<Scene>[];
  props: AssetMatchItem<Prop>[];
  hasAnyMatch: boolean;
}

export interface ApplyResult {
  scriptData: ScriptData;
  shots: Shot[];
  characterRefs: EpisodeCharacterRef[];
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

export function findAssetMatches(scriptData: ScriptData, project: SeriesProject): AssetMatchResult {
  const characters: AssetMatchItem<Character>[] = scriptData.characters.map(aiChar => {
    const match = project.characterLibrary.find(
      libChar => normalize(libChar.name) === normalize(aiChar.name)
    );
    return { aiAsset: aiChar, libraryAsset: match || null, reuse: !!match };
  });

  const scenes: AssetMatchItem<Scene>[] = scriptData.scenes.map(aiScene => {
    const match = project.sceneLibrary.find(
      libScene => normalize(libScene.location) === normalize(aiScene.location)
    );
    return { aiAsset: aiScene, libraryAsset: match || null, reuse: !!match };
  });

  const props: AssetMatchItem<Prop>[] = (scriptData.props || []).map(aiProp => {
    const match = project.propLibrary.find(
      libProp => normalize(libProp.name) === normalize(aiProp.name)
    );
    return { aiAsset: aiProp, libraryAsset: match || null, reuse: !!match };
  });

  const hasAnyMatch =
    characters.some(m => m.libraryAsset !== null) ||
    scenes.some(m => m.libraryAsset !== null) ||
    props.some(m => m.libraryAsset !== null);

  return { characters, scenes, props, hasAnyMatch };
}

export function applyAssetMatches(
  scriptData: ScriptData,
  shots: Shot[],
  matches: AssetMatchResult,
): ApplyResult {
  const charIdMap = new Map<string, string>();
  const sceneIdMap = new Map<string, string>();
  const propIdMap = new Map<string, string>();
  const characterRefs: EpisodeCharacterRef[] = [];

  const newCharacters = matches.characters.map(m => {
    if (m.reuse && m.libraryAsset) {
      const lib = m.libraryAsset;
      const aiId = m.aiAsset.id;
      const newId = 'char_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      charIdMap.set(aiId, newId);

      characterRefs.push({
        characterId: lib.id,
        syncedVersion: lib.version || 1,
        syncStatus: 'synced',
      });

      return {
        ...m.aiAsset,
        id: newId,
        referenceImage: lib.referenceImage || m.aiAsset.referenceImage,
        visualPrompt: lib.visualPrompt || m.aiAsset.visualPrompt,
        negativePrompt: lib.negativePrompt || m.aiAsset.negativePrompt,
        coreFeatures: lib.coreFeatures || m.aiAsset.coreFeatures,
        variations: lib.variations?.map(v => ({ ...v })) || m.aiAsset.variations || [],
        turnaround: lib.turnaround ? { ...lib.turnaround } : m.aiAsset.turnaround,
        status: lib.referenceImage ? 'completed' as const : m.aiAsset.status,
        libraryId: lib.id,
        libraryVersion: lib.version || 1,
      };
    }
    return m.aiAsset;
  });

  const newScenes = matches.scenes.map(m => {
    if (m.reuse && m.libraryAsset) {
      const lib = m.libraryAsset;
      const aiId = m.aiAsset.id;
      const newId = 'scene_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      sceneIdMap.set(aiId, newId);

      return {
        ...m.aiAsset,
        id: newId,
        referenceImage: lib.referenceImage || m.aiAsset.referenceImage,
        visualPrompt: lib.visualPrompt || m.aiAsset.visualPrompt,
        negativePrompt: lib.negativePrompt || m.aiAsset.negativePrompt,
        status: lib.referenceImage ? 'completed' as const : m.aiAsset.status,
      };
    }
    return m.aiAsset;
  });

  const newProps = matches.props.map(m => {
    if (m.reuse && m.libraryAsset) {
      const lib = m.libraryAsset;
      const aiId = m.aiAsset.id;
      const newId = 'prop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      propIdMap.set(aiId, newId);

      return {
        ...m.aiAsset,
        id: newId,
        referenceImage: lib.referenceImage || m.aiAsset.referenceImage,
        visualPrompt: lib.visualPrompt || m.aiAsset.visualPrompt,
        negativePrompt: lib.negativePrompt || m.aiAsset.negativePrompt,
        status: lib.referenceImage ? 'completed' as const : m.aiAsset.status,
      };
    }
    return m.aiAsset;
  });

  const remapId = (id: string, map: Map<string, string>) => map.get(id) || id;

  const newShots = shots.map(shot => {
    const newCharacters = shot.characters.map(cid => remapId(cid, charIdMap));
    const newSceneId = remapId(shot.sceneId, sceneIdMap);
    const newPropsArr = shot.props?.map(pid => remapId(pid, propIdMap));

    let newCharVariations = shot.characterVariations;
    if (newCharVariations) {
      const remapped: Record<string, string> = {};
      for (const [oldCid, varId] of Object.entries(newCharVariations)) {
        remapped[remapId(oldCid, charIdMap)] = varId;
      }
      newCharVariations = remapped;
    }

    return {
      ...shot,
      sceneId: newSceneId,
      characters: newCharacters,
      props: newPropsArr,
      characterVariations: newCharVariations,
    };
  });

  const newScriptData: ScriptData = {
    ...scriptData,
    characters: newCharacters,
    scenes: newScenes,
    props: newProps,
  };

  return { scriptData: newScriptData, shots: newShots, characterRefs };
}

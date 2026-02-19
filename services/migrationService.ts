import { SeriesProject, Series, Episode, Character } from '../types';

const generateId = (prefix: string): string => {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
};

interface LegacyProjectState {
  id: string;
  title: string;
  createdAt: number;
  lastModified: number;
  stage: string;
  rawScript: string;
  targetDuration: string;
  language: string;
  visualStyle: string;
  shotGenerationModel: string;
  scriptData: {
    title: string;
    genre: string;
    logline: string;
    targetDuration?: string;
    language?: string;
    visualStyle?: string;
    shotGenerationModel?: string;
    artDirection?: any;
    characters: Character[];
    scenes: any[];
    props: any[];
    storyParagraphs: any[];
  } | null;
  shots: any[];
  isParsingScript: boolean;
  renderLogs: any[];
}

export async function runV2ToV3Migration(db: IDBDatabase): Promise<void> {
  if (!db.objectStoreNames.contains('projects')) return;
  if (!db.objectStoreNames.contains('seriesProjects')) return;

  const alreadyMigrated = await new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction('seriesProjects', 'readonly');
    const req = tx.objectStore('seriesProjects').count();
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror = () => reject(req.error);
  });
  if (alreadyMigrated) return;

  const legacyProjects = await new Promise<LegacyProjectState[]>((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as LegacyProjectState[]);
    req.onerror = () => reject(req.error);
  });

  if (legacyProjects.length === 0) return;

  console.log(`Migrating ${legacyProjects.length} legacy projects to v3...`);

  const tx = db.transaction(['seriesProjects', 'series', 'episodes'], 'readwrite');
  const spStore = tx.objectStore('seriesProjects');
  const seriesStore = tx.objectStore('series');
  const epStore = tx.objectStore('episodes');

  for (const legacy of legacyProjects) {
    try {
      if (legacy.shots) {
        legacy.shots.forEach((shot: any) => {
          if (shot.videoModel === 'veo-r2v') shot.videoModel = 'veo';
        });
      }
      if (!legacy.renderLogs) legacy.renderLogs = [];
      if (legacy.scriptData && !legacy.scriptData.props) legacy.scriptData.props = [];

      const now = Date.now();
      const projectId = generateId('sproj');
      const seriesId = generateId('series');
      const episodeId = generateId('ep');

      const characters = legacy.scriptData?.characters || [];
      const scenes = legacy.scriptData?.scenes || [];
      const props = legacy.scriptData?.props || [];

      const libraryChars: Character[] = characters.map(c => ({ ...c, version: 1 }));
      const episodeChars: Character[] = characters.map(c => ({ ...c, libraryId: c.id, libraryVersion: 1 }));
      const characterRefs = characters.map(c => ({
        characterId: c.id,
        syncedVersion: 1,
        syncStatus: 'synced' as const,
      }));

      const sp: SeriesProject = {
        id: projectId,
        title: legacy.title,
        createdAt: legacy.createdAt,
        lastModified: legacy.lastModified,
        visualStyle: legacy.visualStyle || 'live-action',
        language: legacy.language || '中文',
        artDirection: legacy.scriptData?.artDirection,
        characterLibrary: libraryChars,
        sceneLibrary: scenes.map(s => ({ ...s })),
        propLibrary: props.map(p => ({ ...p })),
      };

      const s: Series = {
        id: seriesId,
        projectId,
        title: '第一季',
        sortOrder: 0,
        createdAt: now,
        lastModified: now,
      };

      const ep: Episode = {
        id: episodeId,
        projectId,
        seriesId,
        episodeNumber: 1,
        title: legacy.scriptData?.title || legacy.title,
        createdAt: legacy.createdAt,
        lastModified: legacy.lastModified,
        stage: (legacy.stage as Episode['stage']) || 'script',
        rawScript: legacy.rawScript,
        targetDuration: legacy.targetDuration,
        language: legacy.language,
        visualStyle: legacy.visualStyle,
        shotGenerationModel: legacy.shotGenerationModel,
        scriptData: legacy.scriptData ? { ...legacy.scriptData, characters: episodeChars } : null,
        shots: legacy.shots || [],
        isParsingScript: false,
        renderLogs: legacy.renderLogs || [],
        characterRefs,
      };

      spStore.put(sp);
      seriesStore.put(s);
      epStore.put(ep);
    } catch (e) {
      console.error(`Failed to migrate project "${legacy.title}":`, e);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      console.log(`Migration complete: ${legacyProjects.length} projects migrated.`);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

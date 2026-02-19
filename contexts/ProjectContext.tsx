import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { SeriesProject, Series, Episode, Character, EpisodeCharacterRef, ProjectState } from '../types';
import {
  loadSeriesProject, saveSeriesProject,
  getSeriesByProject, saveSeries, createNewSeries, deleteSeries as deleteSeriesFromDB,
  getEpisodesByProject, getEpisodesBySeries, saveEpisode, loadEpisode, createNewEpisode, deleteEpisode as deleteEpisodeFromDB,
} from '../services/storageService';

interface ProjectContextValue {
  project: SeriesProject | null;
  loading: boolean;
  allSeries: Series[];
  allEpisodes: Episode[];
  currentEpisode: Episode | null;

  reloadProject: () => Promise<void>;
  updateProject: (updates: Partial<SeriesProject>) => void;

  addCharacterToLibrary: (character: Character) => void;
  updateCharacterInLibrary: (character: Character) => void;
  removeCharacterFromLibrary: (characterId: string) => void;

  createSeries: (title: string) => Promise<Series>;
  updateSeries: (id: string, updates: Partial<Series>) => Promise<void>;
  removeSeries: (id: string) => Promise<void>;

  setCurrentEpisode: (episode: Episode | null) => void;
  updateEpisode: (updates: Partial<Episode> | ((prev: Episode) => Episode)) => void;
  createEpisode: (seriesId: string, title: string) => Promise<Episode>;
  removeEpisode: (id: string) => Promise<void>;
  getEpisodesForSeries: (seriesId: string) => Episode[];

  syncCharacterToEpisode: (characterId: string) => void;
  syncAllCharactersToEpisode: () => void;
  getOutdatedCharacters: () => EpisodeCharacterRef[];
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider');
  return ctx;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<SeriesProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);

  const reloadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const sp = await loadSeriesProject(projectId);
      setProject(sp);
      const seriesList = await getSeriesByProject(projectId);
      setAllSeries(seriesList);
      const eps = await getEpisodesByProject(projectId);
      setAllEpisodes(eps);
    } catch (e) {
      console.error('Failed to load project:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { reloadProject(); }, [reloadProject]);

  const persistProject = useCallback(async (sp: SeriesProject) => {
    setProject(sp);
    await saveSeriesProject(sp);
  }, []);

  const updateProject = useCallback((updates: Partial<SeriesProject>) => {
    setProject(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates, lastModified: Date.now() };
      saveSeriesProject(updated);
      return updated;
    });
  }, []);

  const addCharacterToLibrary = useCallback((character: Character) => {
    setProject(prev => {
      if (!prev) return null;
      const charWithVersion = { ...character, version: 1 };
      const updated = { ...prev, characterLibrary: [...prev.characterLibrary, charWithVersion], lastModified: Date.now() };
      saveSeriesProject(updated);
      return updated;
    });
  }, []);

  const updateCharacterInLibrary = useCallback((character: Character) => {
    setProject(prev => {
      if (!prev) return null;
      const updated = {
        ...prev,
        characterLibrary: prev.characterLibrary.map(c =>
          c.id === character.id ? { ...character, version: (c.version || 0) + 1 } : c
        ),
        lastModified: Date.now(),
      };
      saveSeriesProject(updated);
      return updated;
    });
  }, []);

  const removeCharacterFromLibrary = useCallback((characterId: string) => {
    setProject(prev => {
      if (!prev) return null;
      const updated = { ...prev, characterLibrary: prev.characterLibrary.filter(c => c.id !== characterId), lastModified: Date.now() };
      saveSeriesProject(updated);
      return updated;
    });
  }, []);

  const handleCreateSeries = useCallback(async (title: string): Promise<Series> => {
    if (!project) throw new Error('No project loaded');
    const s = createNewSeries(project.id, title, allSeries.length);
    await saveSeries(s);
    setAllSeries(prev => [...prev, s]);
    return s;
  }, [project, allSeries]);

  const handleUpdateSeries = useCallback(async (id: string, updates: Partial<Series>) => {
    const target = allSeries.find(s => s.id === id);
    if (!target) return;
    const updated = { ...target, ...updates, lastModified: Date.now() };
    await saveSeries(updated);
    setAllSeries(prev => prev.map(s => s.id === id ? updated : s));
  }, [allSeries]);

  const handleRemoveSeries = useCallback(async (id: string) => {
    await deleteSeriesFromDB(id);
    setAllSeries(prev => prev.filter(s => s.id !== id));
    setAllEpisodes(prev => prev.filter(ep => ep.seriesId !== id));
  }, []);

  const updateEpisode = useCallback((updates: Partial<Episode> | ((prev: Episode) => Episode)) => {
    setCurrentEpisode(prev => {
      if (!prev) return null;
      const updated = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      return updated;
    });
  }, []);

  const handleCreateEpisode = useCallback(async (seriesId: string, title: string): Promise<Episode> => {
    if (!project) throw new Error('No project loaded');
    const seriesEps = allEpisodes.filter(e => e.seriesId === seriesId);
    const ep = createNewEpisode(project.id, seriesId, seriesEps.length + 1, title);
    await saveEpisode(ep);
    setAllEpisodes(prev => [...prev, ep]);
    return ep;
  }, [project, allEpisodes]);

  const handleRemoveEpisode = useCallback(async (id: string) => {
    await deleteEpisodeFromDB(id);
    setAllEpisodes(prev => prev.filter(ep => ep.id !== id));
    if (currentEpisode?.id === id) setCurrentEpisode(null);
  }, [currentEpisode]);

  const getEpisodesForSeries = useCallback((seriesId: string): Episode[] => {
    return allEpisodes.filter(e => e.seriesId === seriesId).sort((a, b) => a.episodeNumber - b.episodeNumber);
  }, [allEpisodes]);

  const syncCharacterToEpisode = useCallback((characterId: string) => {
    if (!project || !currentEpisode?.scriptData) return;
    const libChar = project.characterLibrary.find(c => c.id === characterId);
    if (!libChar) return;

    setCurrentEpisode(prev => {
      if (!prev?.scriptData) return prev;
      const newChars = prev.scriptData.characters.map(c =>
        c.libraryId === characterId ? { ...libChar, libraryId: characterId, libraryVersion: libChar.version || 1, id: c.id, variations: c.variations } : c
      );
      const newRefs = (prev.characterRefs || []).map(r =>
        r.characterId === characterId ? { ...r, syncedVersion: libChar.version || 1, syncStatus: 'synced' as const } : r
      );
      return { ...prev, scriptData: { ...prev.scriptData, characters: newChars }, characterRefs: newRefs };
    });
  }, [project, currentEpisode]);

  const syncAllCharactersToEpisode = useCallback(() => {
    const outdated = getOutdatedCharacters();
    outdated.forEach(ref => syncCharacterToEpisode(ref.characterId));
  }, [syncCharacterToEpisode]);

  const getOutdatedCharacters = useCallback((): EpisodeCharacterRef[] => {
    if (!project || !currentEpisode) return [];
    return (currentEpisode.characterRefs || []).filter(ref => {
      if (ref.syncStatus === 'local-only') return false;
      const libChar = project.characterLibrary.find(c => c.id === ref.characterId);
      return libChar && (libChar.version || 1) > ref.syncedVersion;
    });
  }, [project, currentEpisode]);

  const value: ProjectContextValue = {
    project, loading, allSeries, allEpisodes, currentEpisode,
    reloadProject, updateProject,
    addCharacterToLibrary, updateCharacterInLibrary, removeCharacterFromLibrary,
    createSeries: handleCreateSeries, updateSeries: handleUpdateSeries, removeSeries: handleRemoveSeries,
    setCurrentEpisode, updateEpisode,
    createEpisode: handleCreateEpisode, removeEpisode: handleRemoveEpisode,
    getEpisodesForSeries,
    syncCharacterToEpisode, syncAllCharactersToEpisode, getOutdatedCharacters,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

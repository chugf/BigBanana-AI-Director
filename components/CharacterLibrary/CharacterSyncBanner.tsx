import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { EpisodeCharacterRef, Character } from '../../types';

interface Props {
  outdatedRefs: EpisodeCharacterRef[];
  characterLibrary: Character[];
  onSyncAll: () => void;
  onSyncOne: (characterId: string) => void;
}

const CharacterSyncBanner: React.FC<Props> = ({ outdatedRefs, characterLibrary, onSyncAll, onSyncOne }) => {
  if (outdatedRefs.length === 0) return null;

  const charNames = outdatedRefs.map(ref => {
    const c = characterLibrary.find(ch => ch.id === ref.characterId);
    return c?.name || ref.characterId;
  });

  return (
    <div className="mx-4 mt-4 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div>
            <span className="text-xs font-medium text-blue-400">{outdatedRefs.length} 个角色有更新可用</span>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{charNames.join('、')}</p>
          </div>
        </div>
        <button onClick={onSyncAll} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[10px] font-bold uppercase tracking-widest rounded transition-colors">
          <RefreshCw className="w-3 h-3" />全部同步
        </button>
      </div>
    </div>
  );
};

export default CharacterSyncBanner;

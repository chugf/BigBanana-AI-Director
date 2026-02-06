import React from 'react';
import { MapPin, User, Clock, X, Shirt, Edit2 } from 'lucide-react';
import { Shot, Character, Scene } from '../../types';

interface SceneContextProps {
  shot: Shot;
  scene?: Scene;
  scenes?: Scene[]; // 所有可用场景列表
  characters: Character[];
  availableCharacters: Character[];
  onAddCharacter: (charId: string) => void;
  onRemoveCharacter: (charId: string) => void;
  onVariationChange: (charId: string, varId: string) => void;
  onSceneChange?: (sceneId: string) => void; // 场景切换回调
}

const SceneContext: React.FC<SceneContextProps> = ({
  shot,
  scene,
  scenes = [],
  characters,
  availableCharacters,
  onAddCharacter,
  onRemoveCharacter,
  onVariationChange,
  onSceneChange
}) => {
  return (
    <div className="bg-[var(--bg-surface)] p-5 rounded-xl border border-[var(--border-primary)] mb-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-4 h-4 text-[var(--text-tertiary)]" />
        <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
          场景环境 (Scene Context)
        </h4>
      </div>
      
      <div className="flex gap-4">
        <div className="w-28 h-20 bg-[var(--bg-elevated)] rounded-lg overflow-hidden flex-shrink-0 border border-[var(--border-secondary)] relative">
          {scene?.referenceImage ? (
            <img src={scene.referenceImage} className="w-full h-full object-cover" alt={scene.location} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--bg-hover)]">
              <MapPin className="w-6 h-6 text-[var(--text-muted)]" />
            </div>
          )}
        </div>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            {onSceneChange && scenes.length > 1 ? (
              <select
                value={shot.sceneId}
                onChange={(e) => onSceneChange(e.target.value)}
                className="flex-1 min-w-0 max-w-[180px] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-bold border border-[var(--border-secondary)] rounded px-2 py-1 outline-none focus:border-[var(--accent)] hover:border-[var(--border-secondary)] transition-colors truncate"
                style={{ textOverflow: 'ellipsis' }}
                title={scene?.location}
              >
                {scenes.map(s => (
                  <option key={s.id} value={s.id} title={s.location}>
                    {s.location.length > 20 ? `${s.location.slice(0, 20)}...` : s.location}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[var(--text-primary)] text-sm font-bold truncate max-w-[180px]" title={scene?.location}>
                {scene?.location || '未知场景'}
              </span>
            )}
            <span className="text-sm px-2 py-0.5 bg-[var(--bg-hover)] text-[var(--text-tertiary)] rounded-full flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />
              {scene?.time}
            </span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] line-clamp-2">{scene?.atmosphere}</p>
          
          {/* Character List */}
          <div className="flex flex-col gap-2 pt-2">
            {characters.map(char => {
              const hasVars = char.variations && char.variations.length > 0;
              const selectedVarId = shot.characterVariations?.[char.id];
              
              return (
                <div 
                  key={char.id} 
                  className="flex items-center justify-between bg-[var(--bg-elevated)] rounded p-1.5 border border-[var(--border-primary)] group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[var(--border-secondary)] overflow-hidden flex-shrink-0">
                      {char.referenceImage && (
                        <img src={char.referenceImage} className="w-full h-full object-cover" alt={char.name} />
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] font-medium">{char.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {hasVars && (
                      <select
                        value={selectedVarId || ''}
                        onChange={(e) => onVariationChange(char.id, e.target.value)}
                        className="text-[10px] bg-[var(--bg-hover)] text-[var(--text-tertiary)] border border-[var(--border-secondary)] rounded px-1.5 py-0.5 outline-none"
                      >
                        <option value="">基础造型</option>
                        {char.variations!.map(v => (
                          <option key={v.id} value={v.id}>
                            <Shirt className="w-2 h-2 inline mr-1" />
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => onRemoveCharacter(char.id)}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="移除角色"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            
            {/* Add Character Selector */}
            {availableCharacters.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <select 
                  onChange={(e) => {
                    if (e.target.value) {
                      onAddCharacter(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="flex-1 bg-[var(--bg-elevated)] text-[11px] text-[var(--text-tertiary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 outline-none focus:border-[var(--accent)] hover:border-[var(--border-secondary)] transition-colors"
                >
                  <option value="">+ 添加角色到此镜头</option>
                  {availableCharacters.map(char => (
                    <option key={char.id} value={char.id}>{char.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneContext;

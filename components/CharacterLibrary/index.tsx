import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Users, Trash2, Edit2, Check, X, Loader2, Upload, Eye, Search, Grid, List, Link2 } from 'lucide-react';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useAlert } from '../GlobalAlert';
import { Character } from '../../types';
import { convertImageToBase64 } from '../../services/storageService';
import CharacterSyncBanner from './CharacterSyncBanner';

const CharacterLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const { project, loading, allEpisodes, addCharacterToLibrary, updateCharacterInLibrary, removeCharacterFromLibrary } = useProjectContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCharForm, setNewCharForm] = useState({ name: '', gender: '', age: '', personality: '' });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (loading || !project) {
    return <div className="h-screen flex items-center justify-center bg-[var(--bg-base)]"><Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" /></div>;
  }

  const characters = project.characterLibrary || [];
  const filteredChars = searchQuery.trim()
    ? characters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : characters;

  const getRefCount = (charId: string): number => {
    return allEpisodes.filter(ep =>
      ep.scriptData?.characters.some(c => c.libraryId === charId)
    ).length;
  };

  const handleStartEdit = (char: Character) => {
    setEditingId(char.id);
    setEditForm({ name: char.name, gender: char.gender, age: char.age, personality: char.personality, visualPrompt: char.visualPrompt, coreFeatures: char.coreFeatures });
  };

  const handleSaveEdit = (char: Character) => {
    updateCharacterInLibrary({ ...char, ...editForm });
    setEditingId(null);
  };

  const handleDelete = (char: Character) => {
    const refCount = getRefCount(char.id);
    const msg = refCount > 0 ? `角色"${char.name}"已被 ${refCount} 集引用，删除后各集中的引用副本将变为独立角色。确定删除？` : `确定从角色库删除"${char.name}"吗？`;
    showAlert(msg, { type: 'warning', showCancel: true, onConfirm: () => removeCharacterFromLibrary(char.id) });
  };

  const handleImageUpload = async (charId: string, file: File) => {
    try {
      const base64 = await convertImageToBase64(file);
      const char = characters.find(c => c.id === charId);
      if (char) updateCharacterInLibrary({ ...char, referenceImage: base64, status: 'completed' });
    } catch (e) {
      showAlert(`上传失败: ${e instanceof Error ? e.message : '未知错误'}`, { type: 'error' });
    }
  };

  const handleAddCharacter = () => {
    if (!newCharForm.name.trim()) return;
    const id = 'char_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const char: Character = {
      id, name: newCharForm.name.trim(), gender: newCharForm.gender || '未知', age: newCharForm.age || '未知', personality: newCharForm.personality || '', variations: [], version: 1,
    };
    addCharacterToLibrary(char);
    setNewCharForm({ name: '', gender: '', age: '', personality: '' });
    setShowAddModal(false);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-secondary)] p-8 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-[var(--border-subtle)] pb-6">
          <button onClick={() => navigate(`/project/${project.id}`)} className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-6 group">
            <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />返回项目概览
          </button>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-light text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                <Users className="w-6 h-6 text-[var(--accent-text)]" />角色库
                <span className="text-[var(--text-muted)] text-sm font-mono uppercase tracking-widest">Character Library</span>
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">{project.title} · {characters.length} 个角色</p>
            </div>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-5 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors text-xs font-bold uppercase tracking-widest">
              <Plus className="w-4 h-4" />添加角色
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索角色..." className="w-full pl-9 pr-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-secondary)]" />
          </div>
          <div className="flex border border-[var(--border-primary)]">
            <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><Grid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><List className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Character Grid / List */}
        {filteredChars.length === 0 ? (
          <div className="border border-dashed border-[var(--border-primary)] p-12 text-center text-[var(--text-muted)]">
            <Users className="w-10 h-10 mx-auto mb-4 opacity-30" />
            <p className="text-sm mb-2">{searchQuery ? '未找到匹配角色' : '角色库为空'}</p>
            <p className="text-[10px] font-mono">点击"添加角色"创建新角色，或在集数编辑中将角色加入库</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredChars.map(char => {
              const refCount = getRefCount(char.id);
              return (
                <div key={char.id} className="bg-[var(--bg-primary)] border border-blue-500/30 hover:border-blue-500/60 rounded-xl overflow-hidden group transition-all">
                  <div className="aspect-video bg-[var(--bg-elevated)] relative">
                    {char.referenceImage ? (
                      <img src={char.referenceImage} alt={char.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(char.referenceImage!)} />
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-tertiary)] transition-colors">
                        <Upload className="w-6 h-6 mb-1 opacity-50" />
                        <span className="text-[10px] font-mono">上传参考图</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(char.id, e.target.files[0])} />
                      </label>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-mono rounded uppercase tracking-widest">
                      v{char.version || 1}
                    </div>
                    {refCount > 0 && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-[var(--bg-base)]/80 text-[var(--text-tertiary)] text-[9px] font-mono rounded flex items-center gap-1">
                        <Link2 className="w-3 h-3" />{refCount} 集引用
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {editingId === char.id ? (
                      <div className="space-y-2">
                        <input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-transparent border-b border-[var(--border-secondary)] text-sm text-[var(--text-primary)] outline-none" />
                        <div className="flex gap-2">
                          <input value={editForm.gender || ''} onChange={e => setEditForm(p => ({ ...p, gender: e.target.value }))} placeholder="性别" className="flex-1 bg-transparent border-b border-[var(--border-primary)] text-[10px] text-[var(--text-tertiary)] outline-none" />
                          <input value={editForm.age || ''} onChange={e => setEditForm(p => ({ ...p, age: e.target.value }))} placeholder="年龄" className="flex-1 bg-transparent border-b border-[var(--border-primary)] text-[10px] text-[var(--text-tertiary)] outline-none" />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleSaveEdit(char)} className="px-3 py-1 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[10px] font-bold uppercase">保存</button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 text-[var(--text-muted)] text-[10px]">取消</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-[var(--text-primary)] mb-1">{char.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">{char.gender} · {char.age}</div>
                        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleStartEdit(char)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors rounded" title="编辑"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(char)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error-text)] hover:bg-[var(--bg-hover)] transition-colors rounded" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-[var(--border-primary)] divide-y divide-[var(--border-subtle)]">
            {filteredChars.map(char => {
              const refCount = getRefCount(char.id);
              return (
                <div key={char.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--bg-secondary)] transition-colors group">
                  <div className="w-12 h-12 bg-[var(--bg-elevated)] rounded-lg overflow-hidden flex-shrink-0">
                    {char.referenceImage ? <img src={char.referenceImage} alt={char.name} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-[var(--text-muted)] m-auto mt-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)]">{char.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">{char.gender} · {char.age} · v{char.version || 1}</div>
                  </div>
                  {refCount > 0 && <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-2 py-0.5 rounded"><Link2 className="w-3 h-3 inline mr-1" />{refCount} 集引用</span>}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleStartEdit(char)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(char)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error-text)]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Character Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-md bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest mb-4">添加角色到库</h3>
            <div className="space-y-3">
              <input value={newCharForm.name} onChange={e => setNewCharForm(p => ({ ...p, name: e.target.value }))} placeholder="角色名称 *" className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-secondary)]" autoFocus />
              <div className="flex gap-3">
                <input value={newCharForm.gender} onChange={e => setNewCharForm(p => ({ ...p, gender: e.target.value }))} placeholder="性别" className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" />
                <input value={newCharForm.age} onChange={e => setNewCharForm(p => ({ ...p, age: e.target.value }))} placeholder="年龄" className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" />
              </div>
              <textarea value={newCharForm.personality} onChange={e => setNewCharForm(p => ({ ...p, personality: e.target.value }))} placeholder="性格描述" rows={2} className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none resize-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddCharacter} className="flex-1 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-bold uppercase tracking-widest hover:bg-[var(--btn-primary-hover)]">添加</button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] text-xs font-bold uppercase tracking-widest hover:text-[var(--text-primary)]">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/90 p-6 cursor-pointer" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </div>
      )}
    </div>
  );
};

export default CharacterLibraryPage;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Users, Film, Trash2, Edit2, Check, X, Loader2, FolderOpen, ChevronRight, MapPin, Package } from 'lucide-react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useAlert } from './GlobalAlert';
import { useTheme } from '../contexts/ThemeContext';

const ProjectOverview: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const { project, loading, allSeries, allEpisodes, createSeries, createEpisode, removeSeries, removeEpisode, updateProject, updateSeries, getEpisodesForSeries } = useProjectContext();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [showNewSeries, setShowNewSeries] = useState(false);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());

  if (loading || !project) {
    return <div className="h-screen flex items-center justify-center bg-[var(--bg-base)]"><Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" /></div>;
  }

  const handleSaveTitle = () => {
    if (titleDraft.trim()) updateProject({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) return;
    const s = await createSeries(newSeriesName.trim());
    setNewSeriesName('');
    setShowNewSeries(false);
    setExpandedSeries(prev => new Set(prev).add(s.id));
  };

  const handleCreateEpisode = async (seriesId: string) => {
    const eps = getEpisodesForSeries(seriesId);
    await createEpisode(seriesId, `第 ${eps.length + 1} 集`);
  };

  const handleDeleteSeries = (id: string, title: string) => {
    showAlert(`确定删除剧集"${title}"及其所有集数吗？此操作无法撤销。`, {
      type: 'warning', showCancel: true, onConfirm: () => removeSeries(id),
    });
  };

  const handleDeleteEpisode = (id: string, title: string) => {
    showAlert(`确定删除"${title}"吗？`, {
      type: 'warning', showCancel: true, onConfirm: () => removeEpisode(id),
    });
  };

  const toggleSeries = (id: string) => {
    setExpandedSeries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const getEpisodeDisplayTitle = (episodeNumber: number, title: string) => {
    const episodeTitle = (title || '').trim();
    const projectTitle = (project.title || '').trim();
    if (episodeNumber === 1 && episodeTitle && projectTitle && episodeTitle === projectTitle) {
      return `第 ${episodeNumber} 集`;
    }
    return title;
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-secondary)] p-8 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-10 border-b border-[var(--border-subtle)] pb-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-6 group">
            <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />返回项目列表
          </button>
          <div className="flex items-end justify-between">
            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveTitle()} autoFocus className="text-2xl font-light text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--accent-text)] outline-none" />
                  <button onClick={handleSaveTitle}><Check className="w-5 h-5 text-[var(--success)]" /></button>
                  <button onClick={() => setEditingTitle(false)}><X className="w-5 h-5 text-[var(--text-muted)]" /></button>
                </div>
              ) : (
                <h1 className="text-2xl font-light text-[var(--text-primary)] tracking-tight flex items-center gap-3 group cursor-pointer" onClick={() => { setTitleDraft(project.title); setEditingTitle(true); }}>
                  <FolderOpen className="w-6 h-6 text-[var(--text-muted)]" />
                  {project.title}
                  <Edit2 className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </h1>
              )}
              <p className="text-xs text-[var(--text-muted)] font-mono mt-2">创建于 {formatDate(project.createdAt)}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => navigate(`/project/${project.id}/characters`)} className="flex items-center gap-2 px-5 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors">
                <Users className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-widest">角色库 ({project.characterLibrary.length})</span>
              </button>
            </div>
          </div>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {[
            { label: '剧集', value: allSeries.length, icon: Film },
            { label: '总集数', value: allEpisodes.length, icon: FolderOpen },
            { label: '角色', value: project.characterLibrary.length, icon: Users },
            { label: '场景', value: project.sceneLibrary.length, icon: MapPin },
          ].map(s => (
            <div key={s.label} className="bg-[var(--bg-primary)] border border-[var(--border-primary)] p-5">
              <div className="flex items-center gap-2 text-[var(--text-muted)] mb-2">
                <s.icon className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-widest">{s.label}</span>
              </div>
              <div className="text-2xl font-light text-[var(--text-primary)]">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Series List */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">剧集管理</h2>
          <button onClick={() => setShowNewSeries(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors text-xs font-bold uppercase tracking-widest">
            <Plus className="w-4 h-4" />新建剧集
          </button>
        </div>

        {showNewSeries && (
          <div className="mb-6 flex items-center gap-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] p-4">
            <input value={newSeriesName} onChange={e => setNewSeriesName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateSeries()} placeholder="输入剧集名称，如'第二季'" autoFocus className="flex-1 bg-transparent border-b border-[var(--border-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none py-1" />
            <button onClick={handleCreateSeries} className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-bold uppercase tracking-widest">创建</button>
            <button onClick={() => { setShowNewSeries(false); setNewSeriesName(''); }} className="px-4 py-2 text-[var(--text-muted)] text-xs">取消</button>
          </div>
        )}

        {allSeries.length === 0 ? (
          <div className="border border-dashed border-[var(--border-primary)] p-12 text-center text-[var(--text-muted)]">
            <Film className="w-10 h-10 mx-auto mb-4 opacity-30" />
            <p className="text-sm mb-2">暂无剧集</p>
            <p className="text-[10px] font-mono">点击"新建剧集"开始创作</p>
          </div>
        ) : (
          <div className="space-y-4">
            {allSeries.map(s => {
              const eps = getEpisodesForSeries(s.id);
              const isExpanded = expandedSeries.has(s.id);
              return (
                <div key={s.id} className="bg-[var(--bg-primary)] border border-[var(--border-primary)] overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors" onClick={() => toggleSeries(s.id)}>
                    <div className="flex items-center gap-3">
                      <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <Film className="w-5 h-5 text-[var(--text-tertiary)]" />
                      <span className="text-sm font-bold text-[var(--text-primary)]">{s.title}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">{eps.length} 集</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); handleCreateEpisode(s.id); }} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title="添加新集"><Plus className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSeries(s.id, s.title); }} className="p-2 text-[var(--text-muted)] hover:text-[var(--error-text)] hover:bg-[var(--bg-hover)] transition-colors" title="删除剧集"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-[var(--border-subtle)]">
                      {eps.length === 0 ? (
                        <div className="px-6 py-8 text-center text-[var(--text-muted)] text-xs">
                          暂无集数
                          <button onClick={() => handleCreateEpisode(s.id)} className="ml-2 text-[var(--accent-text)] hover:underline">创建第一集</button>
                        </div>
                      ) : (
                        <div className="divide-y divide-[var(--border-subtle)]">
                          {eps.map(ep => (
                            <div key={ep.id} className="flex items-center justify-between px-6 py-3 hover:bg-[var(--bg-secondary)] transition-colors group">
                              <button onClick={() => navigate(`/project/${project.id}/episode/${ep.id}`)} className="flex items-center gap-3 flex-1 text-left">
                                <span className="w-8 h-8 flex items-center justify-center bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--text-tertiary)] rounded">{ep.episodeNumber}</span>
                                <div>
                                  <div className="text-sm text-[var(--text-primary)]">{getEpisodeDisplayTitle(ep.episodeNumber, ep.title)}</div>
                                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                    {ep.stage === 'script' ? '剧本阶段' : ep.stage === 'assets' ? '资产生成' : ep.stage === 'director' ? '导演工作台' : '导出阶段'}
                                    {' · '}{formatDate(ep.lastModified)}
                                  </div>
                                </div>
                              </button>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleDeleteEpisode(ep.id, getEpisodeDisplayTitle(ep.episodeNumber, ep.title))} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error-text)] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
                        <button onClick={() => handleCreateEpisode(s.id)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                          <Plus className="w-3 h-3" />添加新集
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectOverview;

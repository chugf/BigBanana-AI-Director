import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Folder, ChevronRight, Calendar, AlertTriangle, X, HelpCircle, Cpu } from 'lucide-react';
import { ProjectState } from '../types';
import { getAllProjectsMetadata, createNewProjectState, deleteProjectFromDB } from '../services/storageService';
import { useAlert } from './GlobalAlert';

interface Props {
  onOpenProject: (project: ProjectState) => void;
  onShowOnboarding?: () => void;
  onShowModelConfig?: () => void;
}

const Dashboard: React.FC<Props> = ({ onOpenProject, onShowOnboarding, onShowModelConfig }) => {
  const { showAlert } = useAlert();
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const list = await getAllProjectsMetadata();
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = () => {
    const newProject = createNewProjectState();
    onOpenProject(newProject);
  };

  const requestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };

  const confirmDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // 获取项目名称用于提示
    const project = projects.find(p => p.id === id);
    const projectName = project?.title || '未命名项目';
    
    try {
        console.log('📋 准备删除项目及所有关联资源...');
        await deleteProjectFromDB(id);
        console.log('💾 重新加载项目列表...');
        await loadProjects();
        console.log(`✅ 项目 "${projectName}" 已成功删除`);
        
        // 可选：添加成功提示（如果不想打扰用户可以注释掉）
        // alert(`项目 "${projectName}" 已删除`);
    } catch (error) {
        console.error("❌ 删除项目失败:", error);
        showAlert(`删除项目失败: ${error instanceof Error ? error.message : '未知错误'}\n\n请检查浏览器控制台查看详细信息`, { type: 'error' });
    } finally {
        setDeleteConfirmId(null);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 p-8 md:p-12 font-sans selection:bg-white/20">
      <div className="max-w-7xl mx-auto">
        <header className="mb-16 border-b border-zinc-900 pb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light text-white tracking-tight mb-2 flex items-center gap-3">
              项目库
              <span className="text-zinc-800 text-lg">/</span>
              <span className="text-zinc-600 text-sm font-mono tracking-widest uppercase">Projects Database</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {onShowModelConfig && (
              <button 
                onClick={onShowModelConfig}
                className="group flex items-center gap-2 px-4 py-3 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors"
                title="模型配置"
              >
                <Cpu className="w-4 h-4" />
                <span className="font-medium text-xs tracking-widest uppercase">模型配置</span>
              </button>
            )}
            {onShowOnboarding && (
              <button 
                onClick={onShowOnboarding}
                className="group flex items-center gap-2 px-4 py-3 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors"
                title="查看新手引导"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="font-medium text-xs tracking-widest uppercase">帮助</span>
              </button>
            )}
            <button 
              onClick={handleCreate}
              className="group flex items-center gap-3 px-6 py-3 bg-white text-black hover:bg-zinc-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="font-bold text-xs tracking-widest uppercase">新建项目</span>
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            
            {/* Create New Card */}
            <div 
              onClick={handleCreate}
              className="group cursor-pointer border border-zinc-800 hover:border-zinc-500 bg-[#0A0A0A] flex flex-col items-center justify-center min-h-[240px] transition-all"
            >
              <div className="w-12 h-12 border border-zinc-700 flex items-center justify-center mb-6 group-hover:bg-zinc-800 transition-colors">
                <Plus className="w-5 h-5 text-zinc-500 group-hover:text-white" />
              </div>
              <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest group-hover:text-zinc-300">Create New Project</span>
            </div>

            {/* Project List */}
            {projects.map((proj) => (
              <div 
                key={proj.id}
                onClick={() => onOpenProject(proj)}
                className="group bg-[#0A0A0A] border border-zinc-800 hover:border-zinc-600 p-0 flex flex-col cursor-pointer transition-all relative overflow-hidden h-[240px]"
              >
                  {/* Delete Confirmation Overlay */}
                  {deleteConfirmId === proj.id && (
                    <div 
                        className="absolute inset-0 z-20 bg-[#0A0A0A] flex flex-col items-center justify-center p-6 space-y-4 animate-in fade-in duration-200"
                        onClick={(e) => e.stopPropagation()} 
                    >
                        <div className="w-10 h-10 bg-red-900/20 flex items-center justify-center rounded-full">
                           <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-white font-bold text-xs uppercase tracking-widest">确认删除项目？</p>
                            <p className="text-zinc-500 text-[10px] font-mono">此操作无法撤销</p>
                            <div className="text-[9px] text-zinc-600 space-y-1 pt-2 border-t border-zinc-900">
                              <p>将同时删除以下所有资源：</p>
                              <p className="text-zinc-700 font-mono">· 角色和场景参考图</p>
                              <p className="text-zinc-700 font-mono">· 所有关键帧图像</p>
                              <p className="text-zinc-700 font-mono">· 所有生成的视频片段</p>
                              <p className="text-zinc-700 font-mono">· 渲染历史记录</p>
                            </div>
                        </div>
                        <div className="flex gap-2 w-full pt-2">
                            <button 
                                onClick={cancelDelete}
                                className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-colors border border-zinc-800"
                            >
                                取消
                            </button>
                            <button 
                                onClick={(e) => confirmDelete(e, proj.id)}
                                className="flex-1 py-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-200 text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-900/30"
                            >
                                永久删除
                            </button>
                        </div>
                    </div>
                  )}

                  {/* Normal Content */}
                  <div className="flex-1 p-6 relative flex flex-col">
                     {/* Delete Button */}
                     <button 
                        onClick={(e) => requestDelete(e, proj.id)}
                        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-all rounded-sm z-10"
                        title="删除项目"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                     <div className="flex-1">
                        <Folder className="w-8 h-8 text-zinc-800 mb-6 group-hover:text-zinc-500 transition-colors" />
                        <h3 className="text-sm font-bold text-white mb-2 line-clamp-1 tracking-wide">{proj.title}</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="text-[9px] font-mono text-zinc-500 border border-zinc-800 px-1.5 py-0.5 uppercase tracking-wider">
                              {proj.stage === 'script' ? '剧本阶段' : 
                               proj.stage === 'assets' ? '资产生成' :
                               proj.stage === 'director' ? '导演工作台' : '导出阶段'}
                            </span>
                        </div>
                        {proj.scriptData?.logline && (
                            <p className="text-[10px] text-zinc-600 line-clamp-2 leading-relaxed font-mono border-l border-zinc-800 pl-2">
                            {proj.scriptData.logline}
                            </p>
                        )}
                     </div>
                  </div>

                  <div className="px-6 py-3 border-t border-zinc-900 flex items-center justify-between bg-[#080808]">
                    <div className="flex items-center gap-2 text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
                        <Calendar className="w-3 h-3" />
                        {formatDate(proj.lastModified)}
                    </div>
                    <ChevronRight className="w-3 h-3 text-zinc-700 group-hover:text-white transition-colors" />
                  </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
import React, { useState, useEffect } from 'react';
import { BrainCircuit, Wand2, ChevronRight, AlertCircle, Users, MapPin, List, TextQuote, Clock, BookOpen, PenTool, ArrowLeft, Languages, Aperture, AlignLeft, Plus, RotateCw, Edit2, Check, X, UserPlus, UserMinus } from 'lucide-react';
import { ProjectState } from '../types';
import { parseScriptToData, generateShotList, continueScript, rewriteScript } from '../services/geminiService';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
}

type TabMode = 'story' | 'script';

const DURATION_OPTIONS = [
  { label: '30秒 (广告)', value: '30s' },
  { label: '60秒 (预告)', value: '60s' },
  { label: '2分钟 (片花)', value: '120s' },
  { label: '5分钟 (短片)', value: '300s' },
  { label: '自定义', value: 'custom' }
];

const LANGUAGE_OPTIONS = [
  { label: '中文 (Chinese)', value: '中文' },
  { label: 'English (US)', value: 'English' },
  { label: '日本語 (Japanese)', value: 'Japanese' },
  { label: 'Français (French)', value: 'French' },
  { label: 'Español (Spanish)', value: 'Spanish' }
];

const MODEL_OPTIONS = [
  { label: 'GPT-5.1 (推荐)', value: 'gpt-5.1' },
  { label: 'GPT-5.2', value: 'gpt-5.2' },
  { label: 'GPT-4.1', value: 'gpt-41' },
  { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
  { label: '其他 (自定义)', value: 'custom' }
];

const VISUAL_STYLE_OPTIONS = [
  { label: '🎬 真人影视', value: 'live-action', desc: '超写实电影/电视剧风格' },
  { label: '🌟 日式动漫', value: 'anime', desc: '日本动漫风格，线条感强' },
  { label: '🎨 2D动画', value: '2d-animation', desc: '经典卓别林/迪士尼风格' },
  { label: '👾 3D动画', value: '3d-animation', desc: '皮克斯/梦工厂风格' },
  { label: '🌌 赛博朋克', value: 'cyberpunk', desc: '高科技赛博朋克风' },
  { label: '🖼️ 油画风格', value: 'oil-painting', desc: '油画质感艺术风' },
  { label: '✨ 其他 (自定义)', value: 'custom', desc: '手动输入风格' }
];

const StageScript: React.FC<Props> = ({ project, updateProject }) => {
  const [activeTab, setActiveTab] = useState<TabMode>(project.scriptData ? 'script' : 'story');
  
  const [localScript, setLocalScript] = useState(project.rawScript);
  const [localTitle, setLocalTitle] = useState(project.title);
  const [localDuration, setLocalDuration] = useState(project.targetDuration || '60s');
  const [localLanguage, setLocalLanguage] = useState(project.language || '中文');
  const [localModel, setLocalModel] = useState(project.shotGenerationModel || 'gpt-5.1');
  const [localVisualStyle, setLocalVisualStyle] = useState(project.visualStyle || 'live-action');
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [customStyleInput, setCustomStyleInput] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态管理
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [editingCharacterPrompt, setEditingCharacterPrompt] = useState('');
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [editingShotPrompt, setEditingShotPrompt] = useState('');
  const [editingShotCharactersId, setEditingShotCharactersId] = useState<string | null>(null);

  useEffect(() => {
    setLocalScript(project.rawScript);
    setLocalTitle(project.title);
    setLocalDuration(project.targetDuration || '60s');
    setLocalLanguage(project.language || '中文');
    setLocalModel(project.shotGenerationModel || 'gpt-5.1');
    setLocalVisualStyle(project.visualStyle || 'live-action');
  }, [project.id]);

  const handleDurationSelect = (val: string) => {
    setLocalDuration(val);
    if (val === 'custom') {
      setCustomDurationInput('');
    }
  };

  const handleModelSelect = (val: string) => {
    setLocalModel(val);
    if (val === 'custom') {
      setCustomModelInput('');
    }
  };

  const handleVisualStyleSelect = (val: string) => {
    setLocalVisualStyle(val);
    if (val === 'custom') {
      setCustomStyleInput('');
    }
  };

  const getFinalDuration = () => {
    return localDuration === 'custom' ? customDurationInput : localDuration;
  };

  const getFinalModel = () => {
    return localModel === 'custom' ? customModelInput : localModel;
  };

  const getFinalVisualStyle = () => {
    return localVisualStyle === 'custom' ? customStyleInput : localVisualStyle;
  };

  const handleAnalyze = async () => {
    if (!localScript.trim()) {
      setError("请输入剧本内容。");
      return;
    }

    const finalDuration = getFinalDuration();
    if (!finalDuration) {
      setError("请选择目标时长。");
      return;
    }

    const finalModel = getFinalModel();
    if (!finalModel) {
      setError("请选择或输入模型名称。");
      return;
    }

    const finalVisualStyle = getFinalVisualStyle();
    if (!finalVisualStyle) {
      setError("请选择或输入视觉风格。");
      return;
    }

    console.log('🎯 用户选择的模型:', localModel);
    console.log('🎯 最终使用的模型:', finalModel);
    console.log('🎨 视觉风格:', finalVisualStyle);

    setIsProcessing(true);
    setError(null);
    try {
      updateProject({
        title: localTitle,
        rawScript: localScript,
        targetDuration: finalDuration,
        language: localLanguage,
        visualStyle: finalVisualStyle,
        shotGenerationModel: finalModel,
        isParsingScript: true
      });

      console.log('📞 调用 parseScriptToData, 传入模型:', finalModel);
      const scriptData = await parseScriptToData(localScript, localLanguage, finalModel, finalVisualStyle);
      
      scriptData.targetDuration = finalDuration;
      scriptData.language = localLanguage;
      scriptData.visualStyle = finalVisualStyle;
      scriptData.shotGenerationModel = finalModel;

      if (localTitle && localTitle !== "未命名项目") {
        scriptData.title = localTitle;
      }

      console.log('📞 调用 generateShotList, 传入模型:', finalModel);
      const shots = await generateShotList(scriptData, finalModel);

      updateProject({ 
        scriptData, 
        shots, 
        isParsingScript: false,
        title: scriptData.title 
      });
      
      setActiveTab('script');

    } catch (err: any) {
      console.error(err);
      setError(`错误: ${err.message || "AI 连接失败"}`);
      updateProject({ isParsingScript: false });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleContinueScript = async () => {
    if (!localScript.trim()) {
      setError("请先输入一些剧本内容作为基础。");
      return;
    }

    const finalModel = getFinalModel();
    if (!finalModel) {
      setError("请选择或输入模型名称。");
      return;
    }

    setIsContinuing(true);
    setError(null);
    try {
      const continuedContent = await continueScript(localScript, localLanguage, finalModel);
      const newScript = localScript + '\n\n' + continuedContent;
      setLocalScript(newScript);
      updateProject({ rawScript: newScript });
    } catch (err: any) {
      console.error(err);
      setError(`AI续写失败: ${err.message || "连接失败"}`);
    } finally {
      setIsContinuing(false);
    }
  };

  const handleRewriteScript = async () => {
    if (!localScript.trim()) {
      setError("请先输入剧本内容。");
      return;
    }

    const finalModel = getFinalModel();
    if (!finalModel) {
      setError("请选择或输入模型名称。");
      return;
    }

    setIsRewriting(true);
    setError(null);
    try {
      const rewrittenContent = await rewriteScript(localScript, localLanguage, finalModel);
      setLocalScript(rewrittenContent);
      updateProject({ rawScript: rewrittenContent });
    } catch (err: any) {
      console.error(err);
      setError(`AI改写失败: ${err.message || "连接失败"}`);
    } finally {
      setIsRewriting(false);
    }
  };

  // 编辑角色视觉提示词
  const handleEditCharacter = (characterId: string, currentPrompt: string) => {
    setEditingCharacterId(characterId);
    setEditingCharacterPrompt(currentPrompt || '');
  };

  const handleSaveCharacter = () => {
    if (!editingCharacterId || !project.scriptData) return;
    
    const updatedCharacters = project.scriptData.characters.map(c => 
      c.id === editingCharacterId 
        ? { ...c, visualPrompt: editingCharacterPrompt }
        : c
    );
    
    updateProject({
      scriptData: {
        ...project.scriptData,
        characters: updatedCharacters
      }
    });
    
    setEditingCharacterId(null);
    setEditingCharacterPrompt('');
  };

  const handleCancelCharacterEdit = () => {
    setEditingCharacterId(null);
    setEditingCharacterPrompt('');
  };

  // 编辑分镜画面提示词
  const handleEditShot = (shotId: string, currentPrompt: string) => {
    setEditingShotId(shotId);
    setEditingShotPrompt(currentPrompt || '');
  };

  const handleSaveShot = () => {
    if (!editingShotId) return;
    
    const updatedShots = project.shots.map(shot => {
      if (shot.id === editingShotId && shot.keyframes.length > 0) {
        return {
          ...shot,
          keyframes: shot.keyframes.map((kf, idx) => 
            idx === 0 ? { ...kf, visualPrompt: editingShotPrompt } : kf
          )
        };
      }
      return shot;
    });
    
    updateProject({ shots: updatedShots });
    
    setEditingShotId(null);
    setEditingShotPrompt('');
  };

  const handleCancelShotEdit = () => {
    setEditingShotId(null);
    setEditingShotPrompt('');
  };

  // 编辑分镜角色列表
  const handleEditShotCharacters = (shotId: string) => {
    setEditingShotCharactersId(shotId);
  };

  const handleAddCharacterToShot = (shotId: string, characterId: string) => {
    const updatedShots = project.shots.map(shot => {
      if (shot.id === shotId) {
        // 检查角色是否已存在
        if (!shot.characters.includes(characterId)) {
          return {
            ...shot,
            characters: [...shot.characters, characterId]
          };
        }
      }
      return shot;
    });
    
    updateProject({ shots: updatedShots });
  };

  const handleRemoveCharacterFromShot = (shotId: string, characterId: string) => {
    const updatedShots = project.shots.map(shot => {
      if (shot.id === shotId) {
        return {
          ...shot,
          characters: shot.characters.filter(cid => cid !== characterId)
        };
      }
      return shot;
    });
    
    updateProject({ shots: updatedShots });
  };

  const handleCloseShotCharactersEdit = () => {
    setEditingShotCharactersId(null);
  };

  const renderStoryInput = () => (
    <div className="flex h-full bg-[#050505] text-zinc-300">
      
      {/* Middle Column: Config Panel - Adjusted Width to w-96 */}
      <div className="w-96 border-r border-zinc-800 flex flex-col bg-[#0A0A0A]">
        {/* Header - Fixed Height 56px */}
        <div className="h-14 px-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-zinc-400" />
              项目配置
            </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Title Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">项目标题</label>
              <input 
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                className="w-full bg-[#141414] border border-zinc-800 text-white px-3 py-2.5 text-sm rounded-md focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder:text-zinc-700"
                placeholder="输入项目名称..."
              />
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                输出语言
              </label>
              <div className="relative">
                <select
                  value={localLanguage}
                  onChange={(e) => setLocalLanguage(e.target.value)}
                  className="w-full bg-[#141414] border border-zinc-800 text-white px-3 py-2.5 text-sm rounded-md appearance-none focus:border-zinc-600 focus:outline-none transition-all cursor-pointer"
                >
                  {LANGUAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-3 pointer-events-none">
                   <ChevronRight className="w-4 h-4 text-zinc-600 rotate-90" />
                </div>
              </div>
            </div>

            {/* Duration Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                目标时长
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleDurationSelect(opt.value)}
                    className={`px-2 py-2.5 text-[11px] font-medium rounded-md transition-all text-center border ${
                      localDuration === opt.value
                        ? 'bg-zinc-100 text-black border-zinc-100 shadow-sm'
                        : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {localDuration === 'custom' && (
                <div className="pt-1">
                  <input 
                    type="text"
                    value={customDurationInput}
                    onChange={(e) => setCustomDurationInput(e.target.value)}
                    className="w-full bg-[#141414] border border-zinc-800 text-white px-3 py-2.5 text-sm rounded-md focus:border-zinc-600 focus:outline-none font-mono placeholder:text-zinc-700"
                    placeholder="输入时长 (如: 90s, 3m)"
                  />
                </div>
              )}
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Aperture className="w-3 h-3" />
                分镜生成模型
              </label>
              <div className="grid grid-cols-1 gap-2">
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleModelSelect(opt.value)}
                    className={`px-3 py-2.5 text-[11px] font-medium rounded-md transition-all text-left border ${
                      localModel === opt.value
                        ? 'bg-zinc-100 text-black border-zinc-100 shadow-sm'
                        : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {localModel === 'custom' && (
                <div className="pt-1">
                  <input 
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    className="w-full bg-[#141414] border border-zinc-800 text-white px-3 py-2.5 text-sm rounded-md focus:border-zinc-600 focus:outline-none font-mono placeholder:text-zinc-700"
                    placeholder="输入模型名称 (如: gpt-4o)"
                  />
                </div>
              )}
            </div>

            {/* Visual Style Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Wand2 className="w-3 h-3" />
                视觉风格
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VISUAL_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleVisualStyleSelect(opt.value)}
                    title={opt.desc}
                    className={`px-2 py-2.5 text-[11px] font-medium rounded-md transition-all text-center border ${
                      localVisualStyle === opt.value
                        ? 'bg-zinc-100 text-black border-zinc-100 shadow-sm'
                        : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {localVisualStyle === 'custom' && (
                <div className="pt-1">
                  <input 
                    type="text"
                    value={customStyleInput}
                    onChange={(e) => setCustomStyleInput(e.target.value)}
                    className="w-full bg-[#141414] border border-zinc-800 text-white px-3 py-2.5 text-sm rounded-md focus:border-zinc-600 focus:outline-none font-mono placeholder:text-zinc-700"
                    placeholder="输入风格 (如: 水彩风格, 像素艺术)"
                  />
                </div>
              )}
            </div>
        </div>

        {/* Footer Action */}
        <div className="p-6 border-t border-zinc-800 bg-[#0A0A0A]">
           <button
              onClick={handleAnalyze}
              disabled={isProcessing}
              className={`w-full py-3.5 font-bold text-xs tracking-widest uppercase rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
                isProcessing 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-zinc-200 shadow-white/5'
              }`}
            >
              {isProcessing ? (
                <>
                  <BrainCircuit className="w-4 h-4 animate-spin" />
                  智能分析中...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  生成分镜脚本
                </>
              )}
            </button>
            {error && (
              <div className="mt-4 p-3 bg-red-900/10 border border-red-900/50 text-red-500 text-xs rounded flex items-center gap-2">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {error}
              </div>
            )}
        </div>
      </div>

      {/* Right: Text Editor - Optimized */}
      <div className="flex-1 flex flex-col bg-[#050505] relative">
        <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#050505] shrink-0">
           <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
              <span className="text-xs font-bold text-zinc-400">剧本编辑器</span>
           </div>
           <div className="flex items-center gap-3">
              <button
                onClick={handleContinueScript}
                disabled={isContinuing || isRewriting || !localScript.trim()}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all shadow-sm ${
                  isContinuing || isRewriting || !localScript.trim()
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-zinc-200'
                }`}
              >
                {isContinuing ? (
                  <>
                    <BrainCircuit className="w-3.5 h-3.5 animate-spin" />
                    续写中...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    AI续写
                  </>
                )}
              </button>
              <button
                onClick={handleRewriteScript}
                disabled={isContinuing || isRewriting || !localScript.trim()}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all shadow-sm ${
                  isContinuing || isRewriting || !localScript.trim()
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-zinc-200'
                }`}
              >
                {isRewriting ? (
                  <>
                    <BrainCircuit className="w-3.5 h-3.5 animate-spin" />
                    改写中...
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5" />
                    AI改写
                  </>
                )}
              </button>
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">MARKDOWN SUPPORTED</span>
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
           <div className="max-w-3xl mx-auto h-full flex flex-col py-12 px-8">
              <textarea
                  value={localScript}
                  onChange={(e) => setLocalScript(e.target.value)}
                  className="flex-1 bg-transparent text-zinc-200 font-serif text-lg leading-loose focus:outline-none resize-none placeholder:text-zinc-800 selection:bg-zinc-700"
                  placeholder="在此输入故事大纲或直接粘贴剧本..."
                  spellCheck={false}
              />
           </div>
        </div>

        {/* Editor Status Footer */}
        <div className="h-8 border-t border-zinc-900 bg-[#050505] px-4 flex items-center justify-end gap-4 text-[10px] text-zinc-600 font-mono select-none">
           <span>{localScript.length} 字符</span>
           <span>{localScript.split('\n').length} 行</span>
           <div className="flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
             {project.lastModified ? '已自动保存' : '准备就绪'}
           </div>
        </div>
      </div>
    </div>
  );

  const renderScriptBreakdown = () => {
    // Deduplication Logic
    const seenLocations = new Set();
    const uniqueScenesList = (project.scriptData?.scenes || []).filter(scene => {
      const normalizedLoc = scene.location.trim().toLowerCase();
      if (seenLocations.has(normalizedLoc)) {
        return false;
      }
      seenLocations.add(normalizedLoc);
      return true;
    });

    return (
      <div className="flex flex-col h-full bg-[#050505] animate-in fade-in duration-500">
        {/* Header */}
        <div className="h-16 px-6 border-b border-zinc-800 bg-[#080808] flex items-center justify-between shrink-0 z-20">
           <div className="flex items-center gap-6">
              <h2 className="text-lg font-light text-white tracking-tight flex items-center gap-3">
                 <List className="w-5 h-5 text-zinc-400" />
                 拍摄清单
                 <span className="text-xs text-zinc-600 font-mono uppercase tracking-wider ml-1">Script Manifest</span>
              </h2>
              <div className="h-6 w-px bg-zinc-800"></div>
              
              <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-600 uppercase tracking-widest">项目</span>
                      <span className="text-sm text-zinc-200 font-medium">{project.scriptData?.title}</span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-600 uppercase tracking-widest">时长</span>
                      <span className="text-sm font-mono text-zinc-400">{project.targetDuration}</span>
                  </div>
              </div>
           </div>
           
           <button 
             onClick={() => setActiveTab('story')}
             className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-2 px-4 py-2 hover:bg-zinc-800 rounded-lg transition-all"
           >
             <ArrowLeft className="w-3 h-3" />
             返回编辑
           </button>
        </div>
  
        {/* Content Split View */}
        <div className="flex-1 overflow-hidden flex">
           
           {/* Sidebar: Index */}
           <div className="w-72 border-r border-zinc-800 bg-[#0A0A0A] flex flex-col hidden lg:flex">
              <div className="p-6 border-b border-zinc-900">
                 <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                   <TextQuote className="w-3 h-3" /> 故事梗概
                 </h3>
                 <p className="text-xs text-zinc-400 italic leading-relaxed font-serif">"{project.scriptData?.logline}"</p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {/* Characters */}
                  <section>
                    <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                       <Users className="w-3 h-3" /> 演员表
                    </h3>
                    <div className="space-y-3">
                       {project.scriptData?.characters.map(c => (
                         <div key={c.id} className="group cursor-default p-3 rounded-lg hover:bg-zinc-900/50 transition-colors border border-transparent hover:border-zinc-800">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm text-zinc-300 font-medium group-hover:text-white">{c.name}</span>
                                  <span className="text-[10px] text-zinc-600 font-mono">{c.gender}</span>
                                </div>
                                {editingCharacterId === c.id ? (
                                  <div className="mt-2 space-y-2">
                                    <textarea
                                      value={editingCharacterPrompt}
                                      onChange={(e) => setEditingCharacterPrompt(e.target.value)}
                                      className="w-full bg-[#141414] border border-zinc-700 text-zinc-300 px-2 py-2 text-xs rounded-md focus:border-zinc-500 focus:outline-none resize-none font-mono"
                                      rows={4}
                                      placeholder="输入角色视觉描述..."
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={handleSaveCharacter}
                                        className="px-2 py-1 bg-white text-black text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-200 transition-colors"
                                      >
                                        <Check className="w-3 h-3" />
                                        保存
                                      </button>
                                      <button
                                        onClick={handleCancelCharacterEdit}
                                        className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-700 transition-colors"
                                      >
                                        <X className="w-3 h-3" />
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <p className="text-[10px] text-zinc-500 leading-relaxed font-mono line-clamp-2 flex-1">
                                      {c.visualPrompt || '暂无视觉描述'}
                                    </p>
                                    <button
                                      onClick={() => handleEditCharacter(c.id, c.visualPrompt || '')}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-800 rounded"
                                      title="编辑角色描述"
                                    >
                                      <Edit2 className="w-3 h-3 text-zinc-500 hover:text-white" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  </section>

                  {/* Scenes */}
                  <section>
                    <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                       <MapPin className="w-3 h-3" /> 场景列表
                    </h3>
                    <div className="space-y-1">
                       {uniqueScenesList.map((s) => (
                         <div key={s!.id} className="flex items-center gap-3 text-xs text-zinc-400 group cursor-default p-2 rounded hover:bg-zinc-900/50 transition-colors">
                            <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full group-hover:bg-zinc-400 transition-colors"></div>
                            <span className="truncate group-hover:text-zinc-200">{s!.location}</span>
                         </div>
                       ))}
                    </div>
                  </section>
              </div>
           </div>
  
           {/* Main: Script & Shots */}
           <div className="flex-1 overflow-y-auto bg-[#050505] p-0">
              <div className="max-w-5xl mx-auto pb-20">
                 {project.scriptData?.scenes.map((scene, index) => {
                   const sceneShots = project.shots.filter(s => s.sceneId === scene.id);
                   if (sceneShots.length === 0) return null;

                   return (
                     <div key={scene.id} className="border-b border-zinc-800">
                        {/* Scene Header strip */}
                        <div className="sticky top-0 z-10 bg-[#080808]/95 backdrop-blur border-y border-zinc-800 px-8 py-5 flex items-center justify-between shadow-lg shadow-black/20">
                           <div className="flex items-baseline gap-4">
                              <span className="text-3xl font-bold text-white/10 font-mono">{(index + 1).toString().padStart(2, '0')}</span>
                              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                                 {scene.location}
                              </h3>
                           </div>
                           <div className="flex gap-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                              <span className="flex items-center gap-1.5"><Clock className="w-3 h-3"/> {scene.time}</span>
                              <span className="text-zinc-700">|</span>
                              <span>{scene.atmosphere}</span>
                           </div>
                        </div>
  
                        {/* Shot Rows */}
                        <div className="divide-y divide-zinc-800/50">
                           {sceneShots.map((shot, sIdx) => (
                             <div key={shot.id} className="group bg-[#050505] hover:bg-[#0A0A0A] transition-colors p-8 flex gap-8">
                                
                                {/* Shot ID & Tech Data */}
                                <div className="w-32 flex-shrink-0 flex flex-col gap-4">
                                   <div className="text-xs font-mono text-zinc-500 group-hover:text-white transition-colors">
                                     SHOT {(project.shots.indexOf(shot) + 1).toString().padStart(3, '0')}
                                   </div>
                                   
                                   <div className="flex flex-col gap-2">
                                     <div className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase text-center rounded">
                                       {shot.shotSize || 'MED'}
                                     </div>
                                     <div className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase text-center rounded">
                                       {shot.cameraMovement}
                                     </div>
                                   </div>
                                </div>

                                {/* Main Action */}
                                <div className="flex-1 space-y-4">
                                   <p className="text-zinc-200 text-sm leading-7 font-medium max-w-2xl">
                                     {shot.actionSummary}
                                   </p>
                                   
                                   {shot.dialogue && (
                                      <div className="pl-6 border-l-2 border-zinc-800 group-hover:border-zinc-600 transition-colors py-1">
                                         <p className="text-zinc-400 font-serif italic text-sm">"{shot.dialogue}"</p>
                                      </div>
                                   )}
                                   
                                   {/* Tags/Characters */}
                                   <div className="pt-2">
                                     <div className="flex items-center gap-2 mb-2">
                                       <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">角色</span>
                                       <button
                                         onClick={() => handleEditShotCharacters(shot.id)}
                                         className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-800 rounded"
                                         title="编辑角色列表"
                                       >
                                         <Edit2 className="w-3 h-3 text-zinc-500 hover:text-white" />
                                       </button>
                                     </div>
                                     
                                     {editingShotCharactersId === shot.id ? (
                                       <div className="space-y-3 p-3 bg-[#0A0A0A] border border-zinc-800 rounded-lg">
                                         {/* 当前角色列表 */}
                                         <div className="space-y-2">
                                           <div className="text-[10px] text-zinc-500 uppercase tracking-wider">当前角色</div>
                                           <div className="flex flex-wrap gap-2">
                                             {shot.characters.length === 0 ? (
                                               <span className="text-xs text-zinc-600 italic">无角色</span>
                                             ) : (
                                               shot.characters.map(cid => {
                                                 const char = project.scriptData?.characters.find(c => c.id === cid);
                                                 return char ? (
                                                   <div key={cid} className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-zinc-300 border border-zinc-700 px-2 py-1 rounded-md bg-zinc-900">
                                                     <span>{char.name}</span>
                                                     <button
                                                       onClick={() => handleRemoveCharacterFromShot(shot.id, cid)}
                                                       className="ml-1 hover:text-red-400 transition-colors"
                                                       title="移除角色"
                                                     >
                                                       <X className="w-3 h-3" />
                                                     </button>
                                                   </div>
                                                 ) : null;
                                               })
                                             )}
                                           </div>
                                         </div>
                                         
                                         {/* 可添加的角色 */}
                                         <div className="space-y-2">
                                           <div className="text-[10px] text-zinc-500 uppercase tracking-wider">添加角色</div>
                                           <div className="flex flex-wrap gap-2">
                                             {project.scriptData?.characters
                                               .filter(char => !shot.characters.includes(char.id))
                                               .map(char => (
                                                 <button
                                                   key={char.id}
                                                   onClick={() => handleAddCharacterToShot(shot.id, char.id)}
                                                   className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-zinc-500 border border-zinc-800 px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 transition-colors"
                                                   title="添加角色"
                                                 >
                                                   <UserPlus className="w-3 h-3" />
                                                   <span>{char.name}</span>
                                                 </button>
                                               ))}
                                             {project.scriptData?.characters.filter(char => !shot.characters.includes(char.id)).length === 0 && (
                                               <span className="text-xs text-zinc-600 italic">所有角色已添加</span>
                                             )}
                                           </div>
                                         </div>
                                         
                                         {/* 关闭按钮 */}
                                         <div className="pt-2 border-t border-zinc-800">
                                           <button
                                             onClick={handleCloseShotCharactersEdit}
                                             className="px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-700 transition-colors"
                                           >
                                             <Check className="w-3 h-3" />
                                             完成
                                           </button>
                                         </div>
                                       </div>
                                     ) : (
                                       <div className="flex flex-wrap gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                         {shot.characters.length === 0 ? (
                                           <span className="text-[10px] text-zinc-700 italic">无角色</span>
                                         ) : (
                                           shot.characters.map(cid => {
                                             const char = project.scriptData?.characters.find(c => c.id === cid);
                                             return char ? (
                                               <span key={cid} className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded-full bg-zinc-900">
                                                 {char.name}
                                               </span>
                                             ) : null;
                                           })
                                         )}
                                       </div>
                                     )}
                                   </div>

                                   {/* Mobile Prompt Editor (visible on screens < xl) */}
                                   <div className="xl:hidden pt-4 border-t border-zinc-800/50">
                                     <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2 flex items-center gap-2 justify-between">
                                       <span className="flex items-center gap-2">
                                         <Aperture className="w-3 h-3" /> 画面提示词
                                       </span>
                                       {editingShotId !== shot.id && (
                                         <button
                                           onClick={() => handleEditShot(shot.id, shot.keyframes[0]?.visualPrompt || '')}
                                           className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                                           title="编辑提示词"
                                         >
                                           <Edit2 className="w-3 h-3 text-zinc-400" />
                                         </button>
                                       )}
                                     </div>
                                     {editingShotId === shot.id ? (
                                       <div className="space-y-2">
                                         <textarea
                                           value={editingShotPrompt}
                                           onChange={(e) => setEditingShotPrompt(e.target.value)}
                                           className="w-full bg-[#141414] border border-zinc-700 text-zinc-300 px-3 py-2 text-xs rounded-md focus:border-zinc-500 focus:outline-none resize-none font-mono"
                                           rows={4}
                                           placeholder="输入画面提示词..."
                                         />
                                         <div className="flex gap-2">
                                           <button
                                             onClick={handleSaveShot}
                                             className="px-3 py-1.5 bg-white text-black text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-200 transition-colors"
                                           >
                                             <Check className="w-3 h-3" />
                                             保存
                                           </button>
                                           <button
                                             onClick={handleCancelShotEdit}
                                             className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-700 transition-colors"
                                           >
                                             <X className="w-3 h-3" />
                                             取消
                                           </button>
                                         </div>
                                       </div>
                                     ) : (
                                       <p className="text-[10px] text-zinc-500 font-mono leading-relaxed bg-zinc-900/30 p-2 rounded">
                                         {shot.keyframes[0]?.visualPrompt}
                                       </p>
                                     )}
                                   </div>
                                </div>

                                {/* Prompt Preview */}
                                <div className="w-64 hidden xl:block pl-6 border-l border-zinc-900">
                                   <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest mb-2 flex items-center gap-2 justify-between">
                                      <span className="flex items-center gap-2">
                                        <Aperture className="w-3 h-3" /> 画面提示词
                                      </span>
                                      {editingShotId !== shot.id && (
                                        <button
                                          onClick={() => handleEditShot(shot.id, shot.keyframes[0]?.visualPrompt || '')}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-800 rounded"
                                          title="编辑提示词"
                                        >
                                          <Edit2 className="w-3 h-3 text-zinc-500 hover:text-white" />
                                        </button>
                                      )}
                                   </div>
                                   {editingShotId === shot.id ? (
                                     <div className="space-y-2">
                                       <textarea
                                         value={editingShotPrompt}
                                         onChange={(e) => setEditingShotPrompt(e.target.value)}
                                         className="w-full bg-[#141414] border border-zinc-700 text-zinc-300 px-2 py-2 text-xs rounded-md focus:border-zinc-500 focus:outline-none resize-none font-mono"
                                         rows={6}
                                         placeholder="输入画面提示词..."
                                       />
                                       <div className="flex gap-2">
                                         <button
                                           onClick={handleSaveShot}
                                           className="px-2 py-1 bg-white text-black text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-200 transition-colors"
                                         >
                                           <Check className="w-3 h-3" />
                                           保存
                                         </button>
                                         <button
                                           onClick={handleCancelShotEdit}
                                           className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs font-bold rounded flex items-center gap-1 hover:bg-zinc-700 transition-colors"
                                         >
                                           <X className="w-3 h-3" />
                                           取消
                                         </button>
                                       </div>
                                     </div>
                                   ) : (
                                     <p className="text-[10px] text-zinc-600 font-mono leading-relaxed line-clamp-4 hover:line-clamp-none hover:text-zinc-400 transition-all cursor-text bg-zinc-900/30 p-2 rounded">
                                       {shot.keyframes[0]?.visualPrompt}
                                     </p>
                                   )}
                                </div>

                             </div>
                           ))}
                        </div>
                     </div>
                   );
                 })}
              </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-[#050505]">
      {activeTab === 'story' ? renderStoryInput() : renderScriptBreakdown()}
    </div>
  );
};

export default StageScript;
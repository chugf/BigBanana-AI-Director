import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import StageScript from './components/StageScript';
import StageAssets from './components/StageAssets';
import StageDirector from './components/StageDirector';
import StageExport from './components/StageExport';
import StagePrompts from './components/StagePrompts';
import Dashboard from './components/Dashboard';
import Onboarding, { shouldShowOnboarding, resetOnboarding } from './components/Onboarding';
import { ProjectState } from './types';
import { Key, Save, CheckCircle, ArrowRight, ShieldCheck, Loader2, X } from 'lucide-react';
import { saveProjectToDB } from './services/storageService';
import { setGlobalApiKey, verifyApiKey } from './services/geminiService';
import { setLogCallback, clearLogCallback } from './services/renderLogService';
import logoImg from './logo.png';

function App() {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [inputKey, setInputKey] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Ref to hold debounce timer
  const saveTimeoutRef = useRef<any>(null);
  const hideStatusTimeoutRef = useRef<any>(null);

  // Detect mobile device on mount
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load API Key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('antsk_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setGlobalApiKey(storedKey);
      // 检查是否需要显示首次引导
      if (shouldShowOnboarding()) {
        setShowOnboarding(true);
      }
    }
  }, []);

  // 处理引导完成
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // 处理快速开始选项
  const handleOnboardingQuickStart = (option: 'script' | 'example') => {
    setShowOnboarding(false);
    // 如果选择"从剧本开始"，可以后续扩展为创建新项目
    // 如果选择"看看示例项目"，可以后续扩展为打开示例项目
    console.log('Quick start option:', option);
  };

  // 重新显示引导（供帮助菜单调用）
  const handleShowOnboarding = () => {
    resetOnboarding();
    setShowOnboarding(true);
  };

  // Global error handler to catch API Key errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Check if error is related to API Key
      if (event.error?.name === 'ApiKeyError' || 
          event.error?.message?.includes('API Key missing') ||
          event.error?.message?.includes('AntSK API Key')) {
        console.warn('🔐 检测到 API Key 错误，正在返回登录页...');
        handleClearKey();
        event.preventDefault(); // Prevent default error display
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Check if rejection is related to API Key
      if (event.reason?.name === 'ApiKeyError' ||
          event.reason?.message?.includes('API Key missing') ||
          event.reason?.message?.includes('AntSK API Key')) {
        console.warn('🔐 检测到 API Key 错误，正在返回登录页...');
        handleClearKey();
        event.preventDefault(); // Prevent default error display
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Setup render log callback
  useEffect(() => {
    if (project) {
      setLogCallback((log) => {
        setProject(prev => {
          if (!prev) return null;
          return {
            ...prev,
            renderLogs: [...(prev.renderLogs || []), log]
          };
        });
      });
    } else {
      clearLogCallback();
    }
    
    return () => clearLogCallback();
  }, [project?.id]); // Re-setup when project changes

  // Auto-save logic
  useEffect(() => {
    if (!project) return;

    setSaveStatus('unsaved');
    setShowSaveStatus(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveProjectToDB(project);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 1000); // Debounce 1s

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [project]);

  // Auto-hide save status after 2 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
      hideStatusTimeoutRef.current = setTimeout(() => {
        setShowSaveStatus(false);
      }, 2000);
    } else if (saveStatus === 'saving') {
      setShowSaveStatus(true);
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
    }

    return () => {
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
    };
  }, [saveStatus]);

  const handleSaveKey = async () => {
    if (!inputKey.trim()) return;
    
    setIsVerifying(true);
    setVerifyError('');
    
    try {
      const result = await verifyApiKey(inputKey.trim());
      
      if (result.success) {
        setApiKey(inputKey.trim());
        setGlobalApiKey(inputKey.trim());
        localStorage.setItem('antsk_api_key', inputKey.trim());
      } else {
        setVerifyError(result.message);
      }
    } catch (error: any) {
      setVerifyError(error.message || '验证过程出错');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
      localStorage.removeItem('antsk_api_key');
      setApiKey('');
      setGlobalApiKey('');
      setProject(null);
  };

  const updateProject = (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => {
    if (!project) return;
    setProject(prev => {
      if (!prev) return null;
      // 支持函数式更新
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  };

  const setStage = (stage: 'script' | 'assets' | 'director' | 'export' | 'prompts') => {
    updateProject({ stage });
  };

  const handleOpenProject = (proj: ProjectState) => {
    setProject(proj);
  };

  const handleExitProject = async () => {
    // Force save before exiting
    if (project) {
        await saveProjectToDB(project);
    }
    setProject(null);
  };

  const renderStage = () => {
    if (!project) return null;
    switch (project.stage) {
      case 'script':
        return <StageScript project={project} updateProject={updateProject} />;
      case 'assets':
        return <StageAssets project={project} updateProject={updateProject} />;
      case 'director':
        return <StageDirector project={project} updateProject={updateProject} />;
      case 'export':
        return <StageExport project={project} />;
      case 'prompts':
        return <StagePrompts project={project} updateProject={updateProject} />;
      default:
        return <div className="text-white">未知阶段</div>;
    }
  };

  // API Key Entry Screen (Industrial Design)
  if (!apiKey) {
    // Mobile Warning Screen
    if (isMobile) {
      return (
        <div className="h-screen bg-[#050505] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-6">
            <img src={logoImg} alt="Logo" className="w-20 h-20 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">BigBanana AI Director</h1>
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-8">
              <p className="text-zinc-400 text-base leading-relaxed mb-4">
                为了获得最佳体验，请使用 PC 端浏览器访问。
              </p>
              <p className="text-zinc-600 text-sm">
                本应用需要较大的屏幕空间和桌面级浏览器环境才能正常运行。
              </p>
            </div>
            <div className="text-xs text-zinc-700">
              <a href="https://bigbanana.tree456.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">
                访问产品首页了解更多
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen bg-[#050505] flex relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-0 right-0 p-64 bg-indigo-900/5 blur-[150px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 p-48 bg-zinc-900/10 blur-[120px] rounded-full pointer-events-none"></div>

        {/* Left Side - Feature Showcase */}
        <div className="flex-1 flex flex-col justify-center px-16 py-12 relative z-10">
          <div className="max-w-2xl">
            {/* Logo & Title */}
            <div className="flex items-center gap-4 mb-12">
              <img src={logoImg} alt="Logo" className="w-16 h-16 flex-shrink-0" />
              <div>
                <h1 className="text-4xl font-bold text-white tracking-tight mb-2">BigBanana AI Director</h1>
                <p className="text-sm text-zinc-400 font-mono">工业级 AI 漫剧与视频生成工作台</p>
              </div>
            </div>

            {/* Core Features */}
            <div className="space-y-8 mb-12">
              <div className="bg-[#0A0A0A]/80 border border-zinc-800/50 rounded-xl p-6 backdrop-blur-sm hover:border-indigo-900/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-lg">01</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg mb-2">关键帧驱动生成</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      先生成精准的起始帧和结束帧，利用 Veo/Sora-2 模型在两帧之间生成平滑视频过渡，摆脱传统 Text-to-Video 的随机性
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A0A0A]/80 border border-zinc-800/50 rounded-xl p-6 backdrop-blur-sm hover:border-indigo-900/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-lg">02</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg mb-2">角色一致性保证</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      为每个角色生成标准定妆照，支持多套造型系统（日常/战斗/受伤），所有画面生成均受角色资产强约束，彻底杜绝人物变形
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A0A0A]/80 border border-zinc-800/50 rounded-xl p-6 backdrop-blur-sm hover:border-indigo-900/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-lg">03</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg mb-2">工业化生产流程</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      剧本拆解 → 资产选角 → 分镜生成 → 视频导出，完整的四阶段工作流，支持精细编辑和批量渲染
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A0A0A]/80 border border-zinc-800/50 rounded-xl p-6 backdrop-blur-sm hover:border-indigo-900/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-lg">04</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg mb-2">本地数据存储</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      基于 IndexedDB 的本地浏览器存储，无后端依赖，数据隐私安全，所有项目和资产均在本地管理
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-[560px] flex flex-col items-center justify-center p-12 bg-[#0A0A0A]/50 backdrop-blur-xl border-l border-zinc-800/50 relative z-10">
          <div className="w-full max-w-md bg-[#0A0A0A] border border-zinc-800 p-8 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            
            <div className="flex items-center gap-3 mb-8 border-b border-zinc-900 pb-6">
               <Key className="w-8 h-8 text-indigo-400" />
               <div>
                  <h2 className="text-xl font-bold text-white tracking-wide">开始创作</h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Authentication Required</p>
               </div>
            </div>

            <div className="space-y-6">
               <div>
                 <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">BigBanana API Key</label>
                 <input 
                   type="password" 
                   value={inputKey}
                   onChange={(e) => {
                     setInputKey(e.target.value);
                     setVerifyError('');
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && inputKey.trim() && !isVerifying) {
                       handleSaveKey();
                     }
                   }}
                   placeholder="Enter your API Key..."
                   className="w-full bg-[#141414] border border-zinc-800 text-white px-4 py-3 text-sm rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-900 transition-all font-mono placeholder:text-zinc-700"
                   disabled={isVerifying}
                 />
                 {verifyError && (
                   <p className="mt-2 text-xs text-red-400 flex items-center gap-2">
                     <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                     {verifyError}
                   </p>
                 )}
                 <p className="mt-3 text-[10px] text-zinc-600 leading-relaxed">
                    本应用需要 BigBanana API 支持的图片生成和视频生成模型。
                    <br />
                    <a href="https://api.antsk.cn" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline ml-1">立即购买 API Key</a>
                 </p>
               </div>

               <button 
                 onClick={handleSaveKey}
                 disabled={!inputKey || isVerifying}
                 className="w-full py-3 bg-white text-black font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {isVerifying ? (
                   <>
                     <Loader2 className="w-3 h-3 animate-spin" />
                     验证中...
                   </>
                 ) : (
                   <>
                     Confirm Access <ArrowRight className="w-3 h-3" />
                   </>
                 )}
               </button>

               <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-700 font-mono">
                 <ShieldCheck className="w-3 h-3" />
                 Key is stored locally in your browser
               </div>

               <div className="pt-6 border-t border-zinc-900 mt-6">
                 <div className="flex flex-col gap-2 text-center text-[10px] text-zinc-600">
                   <a href="https://tree456.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">
                     官网：tree456.com
                   </a>
                   <a href="https://bigbanana.tree456.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">
                     BigBanana产品首页
                   </a>
                   <button onClick={() => setShowQrCode(true)} className="hover:text-indigo-400 transition-colors">
                     联系我们
                   </button>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQrCode && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowQrCode(false)}>
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6 relative max-w-sm mx-4 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={() => setShowQrCode(false)} 
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-white text-lg font-bold mb-4 text-center">联系我们</h3>
              <div className="bg-white p-4 rounded-lg">
                <img src="/qrcode.png" alt="联系我们二维码" className="w-full h-auto" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dashboard View
  if (!project) {
    // Mobile Warning for Dashboard
    if (isMobile) {
      return (
        <div className="h-screen bg-[#050505] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-6">
            <img src={logoImg} alt="Logo" className="w-20 h-20 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">BigBanana AI Director</h1>
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-8">
              <p className="text-zinc-400 text-base leading-relaxed mb-4">
                为了获得最佳体验，请使用 PC 端浏览器访问。
              </p>
              <p className="text-zinc-600 text-sm">
                本应用需要较大的屏幕空间和桌面级浏览器环境才能正常运行。
              </p>
            </div>
            <button 
              onClick={handleClearKey}
              className="text-xs text-zinc-600 hover:text-red-500 transition-colors uppercase font-mono tracking-widest"
            >
              Sign Out
            </button>
          </div>
        </div>
      );
    }

    return (
       <>
         <button onClick={handleClearKey} className="fixed top-4 right-4 z-50 text-[10px] text-zinc-600 hover:text-red-500 transition-colors uppercase font-mono tracking-widest">
            Sign Out
         </button>
         <Dashboard onOpenProject={handleOpenProject} onShowOnboarding={handleShowOnboarding} />
         {showOnboarding && (
           <Onboarding 
             onComplete={handleOnboardingComplete}
             onQuickStart={handleOnboardingQuickStart}
           />
         )}
       </>
    );
  }

  // Workspace View
  return (
    <div className="flex h-screen bg-[#121212] font-sans text-gray-100 selection:bg-indigo-500/30">
      <Sidebar 
        currentStage={project.stage} 
        setStage={setStage} 
        onExit={handleExitProject} 
        projectName={project.title}
        onShowOnboarding={handleShowOnboarding}
      />
      
      <main className="ml-72 flex-1 h-screen overflow-hidden relative">
        {renderStage()}
        
        {/* Save Status Indicator */}
        {showSaveStatus && (
          <div className="absolute top-4 right-6 pointer-events-none flex items-center gap-2 text-xs font-mono text-zinc-400 bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm z-50 animate-in fade-in slide-in-from-top-2 duration-200">
             {saveStatus === 'saving' ? (
               <>
                 <Save className="w-3 h-3 animate-pulse" />
                 保存中...
               </>
             ) : (
               <>
                 <CheckCircle className="w-3 h-3 text-green-500" />
                 已保存
               </>
             )}
          </div>
        )}
      </main>
      
      {/* Mobile Warning Overlay for Workspace */}
      {isMobile && (
        <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <img src={logoImg} alt="Logo" className="w-16 h-16 mx-auto mb-2" />
            <h2 className="text-xl font-bold text-white">请使用 PC 端访问</h2>
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6">
              <p className="text-zinc-400 text-sm leading-relaxed">
                为了获得最佳体验，请使用桌面浏览器访问本应用。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <Onboarding 
          onComplete={handleOnboardingComplete}
          onQuickStart={handleOnboardingQuickStart}
        />
      )}
    </div>
  );
}

export default App;
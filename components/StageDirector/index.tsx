import React, { useState, useEffect } from 'react';
import { LayoutGrid, Sparkles, Loader2, AlertCircle, Edit2, Film, Video as VideoIcon } from 'lucide-react';
import { ProjectState, Shot, Keyframe, AspectRatio, VideoDuration } from '../../types';
import { generateImage, generateVideo, generateActionSuggestion, optimizeKeyframePrompt, optimizeBothKeyframes, enhanceKeyframePrompt, splitShotIntoSubShots } from '../../services/geminiService';
import { 
  getRefImagesForShot, 
  buildKeyframePrompt,
  buildKeyframePromptWithAI,
  buildVideoPrompt,
  extractBasePrompt,
  generateId,
  delay,
  convertImageToBase64,
  createKeyframe,
  updateKeyframeInShot,
  generateSubShotIds,
  createSubShot,
  replaceShotWithSubShots
} from './utils';
import { DEFAULTS } from './constants';
import EditModal from './EditModal';
import ShotCard from './ShotCard';
import ShotWorkbench from './ShotWorkbench';
import ImagePreviewModal from './ImagePreviewModal';
import { useAlert } from '../GlobalAlert';
import { getDefaultAspectRatio } from '../../services/modelRegistry';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onApiKeyError?: (error: any) => boolean;
}

const StageDirector: React.FC<Props> = ({ project, updateProject, onApiKeyError }) => {
  const { showAlert } = useAlert();
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [previewImage, setPreviewImage] = useState<{url: string, title: string} | null>(null);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [useAIEnhancement, setUseAIEnhancement] = useState(false); // 是否使用AI增强提示词
  const [isSplittingShot, setIsSplittingShot] = useState(false); // 是否正在拆分镜头
  
  // 关键帧生成使用的横竖屏比例（从默认配置获取）
  const [keyframeAspectRatio, setKeyframeAspectRatio] = useState<AspectRatio>(() => getDefaultAspectRatio());
  
  // 统一的编辑状态
  const [editModal, setEditModal] = useState<{
    type: 'action' | 'keyframe' | 'video';
    value: string;
    shotId?: string;
    frameType?: 'start' | 'end';
  } | null>(null);

  const activeShotIndex = project.shots.findIndex(s => s.id === activeShotId);
  const activeShot = project.shots[activeShotIndex];
  
  const allStartFramesGenerated = project.shots.length > 0 && 
    project.shots.every(s => s.keyframes?.find(k => k.type === 'start')?.imageUrl);

  /**
   * 组件加载时，检测并重置卡住的生成状态
   * 解决关闭系统后重新打开时，状态仍为"generating"导致无法重新生成的问题
   */
  useEffect(() => {
    const hasStuckGenerating = project.shots.some(shot => {
      const stuckKeyframes = shot.keyframes?.some(kf => kf.status === 'generating' && !kf.imageUrl);
      const stuckVideo = shot.interval?.status === 'generating' && !shot.interval?.videoUrl;
      return stuckKeyframes || stuckVideo;
    });

    if (hasStuckGenerating) {
      console.log('🔧 检测到卡住的生成状态，正在重置...');
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(shot => ({
          ...shot,
          keyframes: shot.keyframes?.map(kf => 
            kf.status === 'generating' && !kf.imageUrl
              ? { ...kf, status: 'failed' as const }
              : kf
          ),
          interval: shot.interval && shot.interval.status === 'generating' && !shot.interval.videoUrl
            ? { ...shot.interval, status: 'failed' as const }
            : shot.interval
        }))
      }));
    }
  }, [project.id]); // 仅在项目ID变化时运行，避免重复执行

  /**
   * 更新镜头
   */
  const updateShot = (shotId: string, transform: (s: Shot) => Shot) => {
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map(s => s.id === shotId ? transform(s) : s)
    }));
  };

  /**
   * 生成关键帧
   */
  const handleGenerateKeyframe = async (shot: Shot, type: 'start' | 'end') => {
    const existingKf = shot.keyframes?.find(k => k.type === type);
    const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);
    
    const basePrompt = existingKf?.visualPrompt 
      ? extractBasePrompt(existingKf.visualPrompt, shot.actionSummary)
      : shot.actionSummary;
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    
    // 立即设置生成状态，显示loading
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map(s => {
        if (s.id !== shot.id) return s;
        return updateKeyframeInShot(s, type, createKeyframe(kfId, type, basePrompt, undefined, 'generating'));
      })
    }));
    
    // 根据开关选择是否使用AI增强
    let prompt: string;
    if (useAIEnhancement) {
      try {
        prompt = await buildKeyframePromptWithAI(basePrompt, visualStyle, shot.cameraMovement, type, true);
      } catch (error) {
        console.error('AI增强失败,使用基础提示词:', error);
        prompt = buildKeyframePrompt(basePrompt, visualStyle, shot.cameraMovement, type);
      }
    } else {
      prompt = buildKeyframePrompt(basePrompt, visualStyle, shot.cameraMovement, type);
    }
    
    try {
      const referenceImages = getRefImagesForShot(shot, project.scriptData);
      // 使用当前设置的横竖屏比例生成关键帧
      const url = await generateImage(prompt, referenceImages, keyframeAspectRatio);

      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(s => {
          if (s.id !== shot.id) return s;
          return updateKeyframeInShot(s, type, createKeyframe(kfId, type, prompt, url, 'completed'));
        })
      }));
    } catch (e: any) {
      console.error(e);
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(s => {
          if (s.id !== shot.id) return s;
          return updateKeyframeInShot(s, type, createKeyframe(kfId, type, prompt, undefined, 'failed'));
        })
      }));
      
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`生成失败: ${e.message}`, { type: 'error' });
    }
  };

  /**
   * 上传关键帧图片
   */
  const handleUploadKeyframeImage = async (shot: Shot, type: 'start' | 'end') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!file.type.startsWith('image/')) {
        showAlert('请选择图片文件！', { type: 'warning' });
        return;
      }
      
      try {
        const base64Url = await convertImageToBase64(file);
        const existingKf = shot.keyframes?.find(k => k.type === type);
        const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);
        
        updateProject((prevProject: ProjectState) => ({
          ...prevProject,
          shots: prevProject.shots.map(s => {
            if (s.id !== shot.id) return s;
            const visualPrompt = existingKf?.visualPrompt || shot.actionSummary;
            return updateKeyframeInShot(s, type, createKeyframe(kfId, type, visualPrompt, base64Url, 'completed'));
          })
        }));
      } catch (error) {
        showAlert('读取文件失败！', { type: 'error' });
      }
    };
    
    input.click();
  };

  /**
   * 生成视频
   * @param shot - 镜头数据
   * @param aspectRatio - 横竖屏比例
   * @param duration - 视频时长（仅 Sora 有效）
   * @param modelId - 视频模型 ID
   */
  const handleGenerateVideo = async (shot: Shot, aspectRatio: AspectRatio = '16:9', duration: VideoDuration = 8, modelId?: string) => {
    const sKf = shot.keyframes?.find(k => k.type === 'start');
    const eKf = shot.keyframes?.find(k => k.type === 'end');

    if (!sKf?.imageUrl) return showAlert("请先生成起始帧！", { type: 'warning' });

    // 使用传入的 modelId 或默认模型
    let selectedModel: string = modelId || shot.videoModel || DEFAULTS.videoModel;
    // 规范化模型名称：'veo_3_1_i2v_s_fast_fl_landscape' -> 'veo'
    if (selectedModel.startsWith('veo_3_1')) {
      selectedModel = 'veo';
    }
    
    const projectLanguage = project.language || project.scriptData?.language || '中文';
    
    const videoPrompt = buildVideoPrompt(
      shot.actionSummary,
      shot.cameraMovement,
      selectedModel,
      projectLanguage
    );
    
    const intervalId = shot.interval?.id || generateId(`int-${shot.id}`);
    
    // 更新 shot 的 videoModel
    updateShot(shot.id, (s) => ({
      ...s,
      videoModel: selectedModel as any,
      interval: s.interval ? { ...s.interval, status: 'generating', videoPrompt } : {
        id: intervalId,
        startKeyframeId: sKf.id,
        endKeyframeId: eKf?.id || '',
        duration: duration,
        motionStrength: 5,
        videoPrompt,
        status: 'generating'
      }
    }));
    
    try {
      const videoUrl = await generateVideo(
        videoPrompt, 
        sKf.imageUrl, 
        eKf?.imageUrl,
        selectedModel,
        aspectRatio,
        duration
      );

      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, videoUrl, status: 'completed' } : {
          id: intervalId,
          startKeyframeId: sKf.id,
          endKeyframeId: eKf?.id || '',
          duration: 10,
          motionStrength: 5,
          videoPrompt,
          videoUrl,
          status: 'completed'
        }
      }));
    } catch (e: any) {
      console.error(e);
      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, status: 'failed' } : undefined
      }));
      
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`视频生成失败: ${e.message}`, { type: 'error' });
    }
  };

  /**
   * 复制上一镜头的结束帧
   */
  const handleCopyPreviousEndFrame = () => {
    if (activeShotIndex === 0 || !activeShot) return;
    
    const previousShot = project.shots[activeShotIndex - 1];
    const previousEndKf = previousShot?.keyframes?.find(k => k.type === 'end');
    
    if (!previousEndKf?.imageUrl) {
      showAlert("上一个镜头还没有生成结束帧", { type: 'warning' });
      return;
    }
    
    const existingStartKf = activeShot.keyframes?.find(k => k.type === 'start');
    const newStartKfId = existingStartKf?.id || generateId(`kf-${activeShot.id}-start`);
    
    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s, 
        'start', 
        createKeyframe(newStartKfId, 'start', previousEndKf.visualPrompt, previousEndKf.imageUrl, 'completed')
      );
    });
  };

  /**
   * 复制下一镜头的起始帧到当前镜头的结束帧
   */
  const handleCopyNextStartFrame = () => {
    if (activeShotIndex >= project.shots.length - 1 || !activeShot) return;
    
    const nextShot = project.shots[activeShotIndex + 1];
    const nextStartKf = nextShot?.keyframes?.find(k => k.type === 'start');
    
    if (!nextStartKf?.imageUrl) {
      showAlert("下一个镜头还没有生成起始帧", { type: 'warning' });
      return;
    }
    
    const existingEndKf = activeShot.keyframes?.find(k => k.type === 'end');
    const newEndKfId = existingEndKf?.id || generateId(`kf-${activeShot.id}-end`);
    
    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s, 
        'end', 
        createKeyframe(newEndKfId, 'end', nextStartKf.visualPrompt, nextStartKf.imageUrl, 'completed')
      );
    });
  };

  /**
   * 批量生成关键帧
   */
  const handleBatchGenerateImages = async () => {
    const isRegenerate = allStartFramesGenerated;
    
    let shotsToProcess = [];
    if (isRegenerate) {
      showAlert("确定要重新生成所有镜头的首帧吗？这将覆盖现有图片。", {
        type: 'warning',
        showCancel: true,
        onConfirm: async () => {
          shotsToProcess = [...project.shots];
          await executeBatchGenerate(shotsToProcess, isRegenerate);
        }
      });
      return;
    } else {
      shotsToProcess = project.shots.filter(s => !s.keyframes?.find(k => k.type === 'start')?.imageUrl);
    }
    
    if (shotsToProcess.length === 0) return;
    await executeBatchGenerate(shotsToProcess, isRegenerate);
  };

  const executeBatchGenerate = async (shotsToProcess: any[], isRegenerate: boolean) => {
    setBatchProgress({ 
      current: 0, 
      total: shotsToProcess.length, 
      message: isRegenerate ? "正在重新生成所有首帧..." : "正在批量生成缺失的首帧..." 
    });

    for (let i = 0; i < shotsToProcess.length; i++) {
      if (i > 0) await delay(DEFAULTS.batchGenerateDelay);
      
      const shot = shotsToProcess[i];
      setBatchProgress({ 
        current: i + 1, 
        total: shotsToProcess.length, 
        message: `正在生成镜头 ${i+1}/${shotsToProcess.length}...` 
      });
      
      try {
        await handleGenerateKeyframe(shot, 'start');
      } catch (e: any) {
        console.error(`Failed to generate for shot ${shot.id}`, e);
        if (onApiKeyError && onApiKeyError(e)) {
          setBatchProgress(null);
          return;
        }
      }
    }

    setBatchProgress(null);
  };

  /**
   * 保存编辑内容
   */
  const handleSaveEdit = () => {
    if (!editModal || !activeShot) return;
    
    switch (editModal.type) {
      case 'action':
        updateShot(activeShot.id, (s) => ({ ...s, actionSummary: editModal.value }));
        break;
      case 'keyframe':
        updateShot(activeShot.id, (s) => ({
          ...s,
          keyframes: s.keyframes?.map(kf => 
            kf.type === editModal.frameType 
              ? { ...kf, visualPrompt: editModal.value }
              : kf
          ) || []
        }));
        break;
      case 'video':
        updateShot(activeShot.id, (s) => ({
          ...s,
          interval: s.interval ? { ...s.interval, videoPrompt: editModal.value } : undefined
        }));
        break;
    }
    
    setEditModal(null);
  };

  /**
   * AI生成动作建议
   */
  const handleGenerateAIAction = async () => {
    if (!activeShot) return;
    
    const startKf = activeShot.keyframes?.find(k => k.type === 'start');
    const endKf = activeShot.keyframes?.find(k => k.type === 'end');
    
    // 检查是否有首帧和尾帧
    if (!startKf?.visualPrompt && !endKf?.visualPrompt) {
      showAlert('请先生成或编辑首帧和尾帧的提示词，以便AI更好地理解场景', { type: 'warning' });
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      const startPrompt = startKf?.visualPrompt || activeShot.actionSummary || '未定义的起始场景';
      const endPrompt = endKf?.visualPrompt || activeShot.actionSummary || '未定义的结束场景';
      const cameraMovement = activeShot.cameraMovement || '平移';
      
      const suggestion = await generateActionSuggestion(
        startPrompt,
        endPrompt,
        cameraMovement
      );
      
      // 更新编辑框的内容
      if (editModal && editModal.type === 'action') {
        setEditModal({ ...editModal, value: suggestion });
      }
    } catch (e: any) {
      console.error('AI动作生成失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI动作生成失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI优化关键帧提示词（单个）
   */
  const handleOptimizeKeyframeWithAI = async (type: 'start' | 'end') => {
    if (!activeShot) return;
    
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(activeShot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      // 获取角色信息
      const characterNames: string[] = [];
      if (activeShot.characters && project.scriptData?.characters) {
        activeShot.characters.forEach(charId => {
          const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
          if (char) characterNames.push(char.name);
        });
      }
      
      const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
      const actionSummary = activeShot.actionSummary || '未定义的动作';
      const cameraMovement = activeShot.cameraMovement || '平移';
      
      const optimizedPrompt = await optimizeKeyframePrompt(
        type,
        actionSummary,
        cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle
      );
      
      // 更新关键帧的visualPrompt
      const existingKf = activeShot.keyframes?.find(k => k.type === type);
      const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-${type}`);
      
      updateShot(activeShot.id, (s) => {
        return updateKeyframeInShot(
          s,
          type,
          createKeyframe(kfId, type, optimizedPrompt, existingKf?.imageUrl, existingKf?.status || 'pending')
        );
      });
      
      showAlert(`${type === 'start' ? '起始帧' : '结束帧'}提示词已优化`, { type: 'success' });
    } catch (e: any) {
      console.error('AI优化失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI优化失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI一次性优化起始帧和结束帧（推荐）
   */
  const handleOptimizeBothKeyframes = async () => {
    if (!activeShot) return;
    
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(activeShot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      // 获取角色信息
      const characterNames: string[] = [];
      if (activeShot.characters && project.scriptData?.characters) {
        activeShot.characters.forEach(charId => {
          const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
          if (char) characterNames.push(char.name);
        });
      }
      
      const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
      const actionSummary = activeShot.actionSummary || '未定义的动作';
      const cameraMovement = activeShot.cameraMovement || '平移';
      
      const result = await optimizeBothKeyframes(
        actionSummary,
        cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle
      );
      
      // 同时更新起始帧和结束帧
      const startKf = activeShot.keyframes?.find(k => k.type === 'start');
      const endKf = activeShot.keyframes?.find(k => k.type === 'end');
      const startKfId = startKf?.id || generateId(`kf-${activeShot.id}-start`);
      const endKfId = endKf?.id || generateId(`kf-${activeShot.id}-end`);
      
      updateShot(activeShot.id, (s) => {
        let updated = updateKeyframeInShot(
          s,
          'start',
          createKeyframe(startKfId, 'start', result.startPrompt, startKf?.imageUrl, startKf?.status || 'pending')
        );
        updated = updateKeyframeInShot(
          updated,
          'end',
          createKeyframe(endKfId, 'end', result.endPrompt, endKf?.imageUrl, endKf?.status || 'pending')
        );
        return updated;
      });
      
      showAlert('起始帧和结束帧提示词已优化', { type: 'success' });
    } catch (e: any) {
      console.error('AI优化失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI优化失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI拆分镜头
   * 将单个镜头拆分为多个细致的子镜头（按景别和视角）
   */
  const handleSplitShot = async (shot: Shot) => {
    if (!shot) return;
    
    // 1. 获取场景信息
    const scene = project.scriptData?.scenes.find(s => String(s.id) === String(shot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }
    
    // 2. 获取角色名称
    const characterNames: string[] = [];
    if (shot.characters && project.scriptData?.characters) {
      shot.characters.forEach(charId => {
        const char = project.scriptData?.characters.find(c => String(c.id) === String(charId));
        if (char) characterNames.push(char.name);
      });
    }
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    const shotGenerationModel = project.shotGenerationModel || 'gpt-5.1';
    
    // 3. 调用AI拆分
    setIsSplittingShot(true);
    
    try {
      const subShotsData = await splitShotIntoSubShots(
        shot,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere
        },
        characterNames,
        visualStyle,
        shotGenerationModel
      );
      
      // 4. 生成子镜头对象
      const subShotIds = generateSubShotIds(shot.id, subShotsData.subShots.length);
      const subShots = subShotsData.subShots.map((data, idx) => 
        createSubShot(shot, data, subShotIds[idx])
      );
      
      // 5. 替换原镜头
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: replaceShotWithSubShots(prevProject.shots, shot.id, subShots)
      }));
      
      // 6. 关闭工作台，显示成功提示
      setActiveShotId(null);
      showAlert(`镜头已拆分为 ${subShots.length} 个子镜头`, { type: 'success' });
    } catch (e: any) {
      console.error('镜头拆分失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`拆分失败: ${e.message}`, { type: 'error' });
    } finally {
      setIsSplittingShot(false);
    }
  };

  // 空状态
  if (!project.shots.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] bg-[var(--bg-secondary)]">
        <AlertCircle className="w-12 h-12 mb-4 opacity-50"/>
        <p>暂无镜头数据，请先返回阶段 1 生成分镜表。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] relative overflow-hidden">
      
      {/* Batch Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-base)]/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">{batchProgress.message}</h3>
          <div className="w-64 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[var(--accent)] transition-all duration-300" 
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[var(--text-tertiary)] mt-3 text-xs font-mono">
            {Math.round((batchProgress.current / batchProgress.total) * 100)}%
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-[var(--border-primary)] bg-[var(--bg-elevated)] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
            导演工作台
            <span className="text-xs text-[var(--text-muted)] font-mono font-normal uppercase tracking-wider bg-[var(--bg-base)]/30 px-2 py-1 rounded">
              Director Workbench
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* AI增强开关 */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-base)]/30 border border-[var(--border-primary)]">
            <Sparkles className={`w-3.5 h-3.5 ${useAIEnhancement ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-[var(--text-tertiary)]">AI增强提示词</span>
              <input
                type="checkbox"
                checked={useAIEnhancement}
                onChange={(e) => setUseAIEnhancement(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border-secondary)] bg-[var(--bg-hover)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
            </label>
          </div>
          
          <span className="text-xs text-[var(--text-tertiary)] mr-4 font-mono">
            {project.shots.filter(s => s.interval?.videoUrl).length} / {project.shots.length} 完成
          </span>
          <button 
            onClick={handleBatchGenerateImages}
            disabled={!!batchProgress}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
              allStartFramesGenerated
                ? 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] border border-[var(--border-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] shadow-lg shadow-[var(--btn-primary-shadow)]'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {allStartFramesGenerated ? '重新生成所有首帧' : '批量生成首帧'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Grid View */}
        <div className={`flex-1 overflow-y-auto p-6 transition-all duration-500 ease-in-out ${activeShotId ? 'border-r border-[var(--border-primary)]' : ''}`}>
          <div className={`grid gap-4 ${activeShotId ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {project.shots.map((shot, idx) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={idx}
                isActive={activeShotId === shot.id}
                onClick={() => setActiveShotId(shot.id)}
              />
            ))}
          </div>
        </div>

        {/* Workbench */}
        {activeShotId && activeShot && (
          <ShotWorkbench
            shot={activeShot}
            shotIndex={activeShotIndex}
            totalShots={project.shots.length}
            scriptData={project.scriptData}
            currentVideoModelId={activeShot.videoModel || DEFAULTS.videoModel}
            nextShotHasStartFrame={!!project.shots[activeShotIndex + 1]?.keyframes?.find(k => k.type === 'start')?.imageUrl}
            isAIOptimizing={isAIGenerating}
            isSplittingShot={isSplittingShot}
            onClose={() => setActiveShotId(null)}
            onPrevious={() => setActiveShotId(project.shots[activeShotIndex - 1].id)}
            onNext={() => setActiveShotId(project.shots[activeShotIndex + 1].id)}
            onEditActionSummary={() => setEditModal({ type: 'action', value: activeShot.actionSummary })}
            onGenerateAIAction={handleGenerateAIAction}
            onSplitShot={() => handleSplitShot(activeShot)}
            onAddCharacter={(charId) => updateShot(activeShot.id, s => ({ ...s, characters: [...s.characters, charId] }))}
            onRemoveCharacter={(charId) => updateShot(activeShot.id, s => ({
              ...s,
              characters: s.characters.filter(id => id !== charId),
              characterVariations: Object.fromEntries(
                Object.entries(s.characterVariations || {}).filter(([k]) => k !== charId)
              )
            }))}
            onVariationChange={(charId, varId) => updateShot(activeShot.id, s => ({
              ...s,
              characterVariations: { ...(s.characterVariations || {}), [charId]: varId }
            }))}
            onSceneChange={(sceneId) => updateShot(activeShot.id, s => ({ ...s, sceneId }))}
            onGenerateKeyframe={(type) => handleGenerateKeyframe(activeShot, type)}
            onUploadKeyframe={(type) => handleUploadKeyframeImage(activeShot, type)}
            onEditKeyframePrompt={(type, prompt) => setEditModal({ type: 'keyframe', value: prompt, frameType: type })}
            onOptimizeKeyframeWithAI={(type) => handleOptimizeKeyframeWithAI(type)}
            onOptimizeBothKeyframes={handleOptimizeBothKeyframes}
            onCopyPreviousEndFrame={handleCopyPreviousEndFrame}
            onCopyNextStartFrame={handleCopyNextStartFrame}
            useAIEnhancement={useAIEnhancement}
            onToggleAIEnhancement={() => setUseAIEnhancement(!useAIEnhancement)}
            onGenerateVideo={(aspectRatio, duration, modelId) => handleGenerateVideo(activeShot, aspectRatio, duration, modelId)}
            onVideoModelChange={(modelId) => updateShot(activeShot.id, s => ({
              ...s,
              videoModel: modelId as any
            }))}
            onEditVideoPrompt={() => {
              // 如果videoPrompt不存在，动态生成一个
              let promptValue = activeShot.interval?.videoPrompt;
              if (!promptValue) {
                const selectedModel = activeShot.videoModel || DEFAULTS.videoModel;
                const projectLanguage = project.language || project.scriptData?.language || '中文';
                promptValue = buildVideoPrompt(
                  activeShot.actionSummary,
                  activeShot.cameraMovement,
                  selectedModel,
                  projectLanguage
                );
              }
              setEditModal({ 
                type: 'video', 
                value: promptValue
              });
            }}
            onImageClick={(url, title) => setPreviewImage({ url, title })}
          />
        )}
      </div>

      {/* Edit Modal */}
      <EditModal
        isOpen={!!editModal}
        onClose={() => setEditModal(null)}
        onSave={handleSaveEdit}
        title={
          editModal?.type === 'action' ? '编辑叙事动作' :
          editModal?.type === 'keyframe' ? '编辑关键帧提示词' :
          '编辑视频提示词'
        }
        icon={
          editModal?.type === 'action' ? <Film className="w-4 h-4 text-[var(--accent-text)]" /> :
          editModal?.type === 'keyframe' ? <Edit2 className="w-4 h-4 text-[var(--accent-text)]" /> :
          <VideoIcon className="w-4 h-4 text-[var(--accent-text)]" />
        }
        value={editModal?.value || ''}
        onChange={(value) => setEditModal(editModal ? { ...editModal, value } : null)}
        placeholder={
          editModal?.type === 'action' ? '描述镜头的动作和内容...' :
          editModal?.type === 'keyframe' ? '输入关键帧的提示词...' :
          '输入视频生成的提示词...'
        }
        textareaClassName={editModal?.type === 'keyframe' || editModal?.type === 'video' ? 'font-mono' : 'font-normal'}
        showAIGenerate={editModal?.type === 'action'}
        onAIGenerate={handleGenerateAIAction}
        isAIGenerating={isAIGenerating}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage?.url || null}
        title={previewImage?.title}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

export default StageDirector;

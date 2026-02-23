import React, { useState, useEffect, useRef } from 'react';
import { ProjectState, ScriptData, ScriptGenerationCheckpoint, ScriptGenerationStep, Shot } from '../../types';
import { useAlert } from '../GlobalAlert';
import {
  parseScriptStructure,
  enrichScriptDataVisuals,
  generateShotList,
  continueScript,
  continueScriptStream,
  rewriteScript,
  rewriteScriptStream,
  rewriteScriptSegment,
  rewriteScriptSegmentStream,
  setScriptLogCallback,
  clearScriptLogCallback,
  logScriptProgress,
} from '../../services/aiService';
import { getFinalValue, validateConfig } from './utils';
import { DEFAULTS } from './constants';
import ConfigPanel from './ConfigPanel';
import ScriptEditor from './ScriptEditor';
import SceneBreakdown from './SceneBreakdown';
import AssetMatchDialog from './AssetMatchDialog';
import { findAssetMatches, applyAssetMatches, AssetMatchResult } from '../../services/assetMatchService';
import { loadSeriesProject } from '../../services/storageService';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onShowModelConfig?: () => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

type TabMode = 'story' | 'script';

const StageScript: React.FC<Props> = ({ project, updateProject, onShowModelConfig, onGeneratingChange }) => {
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<TabMode>(project.scriptData ? 'script' : 'story');

  const getDraftValue = (selected: string, customInput: string, fallback: string): string => {
    if (selected !== 'custom') return selected;
    const trimmed = customInput.trim();
    return trimmed || fallback;
  };

  const buildAnalyzeConfigKey = (input: {
    script: string;
    language: string;
    targetDuration: string;
    model: string;
    visualStyle: string;
  }): string => {
    const raw = JSON.stringify(input);
    let hash = 5381;
    for (let i = 0; i < raw.length; i += 1) {
      hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    }
    return `v1-${(hash >>> 0).toString(16)}-${raw.length}`;
  };

  const isPlaceholderProjectTitle = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (/^untitled\b/i.test(trimmed)) return true;
    if (/^episode\s*\d+$/i.test(trimmed)) return true;
    if (/^project\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/i.test(trimmed)) return true;
    return false;
  };

  const hydrateScriptDataMeta = (
    source: ScriptData,
    params: {
      targetDuration: string;
      language: string;
      visualStyle: string;
      model: string;
      localTitle: string;
    }
  ): ScriptData => {
    const next: ScriptData = {
      ...source,
      targetDuration: params.targetDuration,
      language: params.language,
      visualStyle: params.visualStyle,
      shotGenerationModel: params.model
    };
    const trimmedTitle = params.localTitle.trim();
    if (!isPlaceholderProjectTitle(trimmedTitle)) {
      next.title = trimmedTitle;
    }
    return next;
  };

  const createAnalyzeCheckpoint = (
    step: ScriptGenerationStep,
    configKey: string,
    scriptData?: ScriptData | null
  ): ScriptGenerationCheckpoint => ({
    step,
    configKey,
    scriptData: scriptData || null,
    updatedAt: Date.now()
  });

  const isAbortError = (err: unknown, signal?: AbortSignal): boolean => {
    if (signal?.aborted) return true;
    const message = String((err as any)?.message || '').toLowerCase();
    return (
      message.includes('abort') ||
      message.includes('aborted') ||
      message.includes('cancel') ||
      message.includes('canceled') ||
      message.includes('取消')
    );
  };
  
  // Configuration state
  const [localScript, setLocalScript] = useState(project.rawScript);
  const [localTitle, setLocalTitle] = useState(project.title);
  const [localDuration, setLocalDuration] = useState(project.targetDuration || DEFAULTS.duration);
  const [localLanguage, setLocalLanguage] = useState(project.language || DEFAULTS.language);
  const [localModel, setLocalModel] = useState(project.shotGenerationModel || DEFAULTS.model);
  const [localVisualStyle, setLocalVisualStyle] = useState(project.visualStyle || DEFAULTS.visualStyle);
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [customStyleInput, setCustomStyleInput] = useState('');
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingLogs, setProcessingLogs] = useState<string[]>([]);

  // Asset match state
  const [pendingParseResult, setPendingParseResult] = useState<{
    scriptData: ScriptData;
    shots: Shot[];
    matches: AssetMatchResult;
    title: string;
  } | null>(null);

  // Editing state - unified
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [editingCharacterPrompt, setEditingCharacterPrompt] = useState('');
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [editingShotPrompt, setEditingShotPrompt] = useState('');
  const [editingShotCharactersId, setEditingShotCharactersId] = useState<string | null>(null);
  const [editingShotActionId, setEditingShotActionId] = useState<string | null>(null);
  const [editingShotActionText, setEditingShotActionText] = useState('');
  const [editingShotDialogueText, setEditingShotDialogueText] = useState('');
  const [lastRewriteSnapshot, setLastRewriteSnapshot] = useState<string | null>(null);
  const analyzeAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setLocalScript(project.rawScript);
    setLocalTitle(project.title);
    setLocalDuration(project.targetDuration || DEFAULTS.duration);
    setLocalLanguage(project.language || DEFAULTS.language);
    setLocalModel(project.shotGenerationModel || DEFAULTS.model);
    setLocalVisualStyle(project.visualStyle || DEFAULTS.visualStyle);
    setRewriteInstruction('');
    setSelectionRange(null);
    setLastRewriteSnapshot(null);
  }, [project.id]);

  // 上报生成状态给父组件，用于导航锁定
  useEffect(() => {
    const generating = isProcessing || isContinuing || isRewriting;
    onGeneratingChange?.(generating);
  }, [isProcessing, isContinuing, isRewriting]);

  // 组件卸载时重置生成状态
  useEffect(() => {
    return () => {
      analyzeAbortControllerRef.current?.abort();
      onGeneratingChange?.(false);
    };
  }, []);

  useEffect(() => {
    setScriptLogCallback((message) => {
      setProcessingLogs(prev => {
        const next = [...prev, message];
        return next.slice(-8);
      });
    });

    return () => clearScriptLogCallback();
  }, []);

  useEffect(() => {
    if (isProcessing || isContinuing || isRewriting) return;

    const draftDuration = getDraftValue(localDuration, customDurationInput, project.targetDuration || DEFAULTS.duration);
    const draftModel = getDraftValue(localModel, customModelInput, project.shotGenerationModel || DEFAULTS.model);
    const draftVisualStyle = getDraftValue(localVisualStyle, customStyleInput, project.visualStyle || DEFAULTS.visualStyle);

    const draftUpdates = {
      rawScript: localScript,
      title: localTitle,
      targetDuration: draftDuration,
      language: localLanguage,
      shotGenerationModel: draftModel,
      visualStyle: draftVisualStyle,
    };

    const unchanged =
      draftUpdates.rawScript === project.rawScript &&
      draftUpdates.title === project.title &&
      draftUpdates.targetDuration === project.targetDuration &&
      draftUpdates.language === project.language &&
      draftUpdates.shotGenerationModel === project.shotGenerationModel &&
      draftUpdates.visualStyle === project.visualStyle;

    if (unchanged) return;

    const timeoutId = window.setTimeout(() => {
      updateProject(draftUpdates);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [
    isProcessing,
    isContinuing,
    isRewriting,
    localScript,
    localTitle,
    localDuration,
    customDurationInput,
    localLanguage,
    localModel,
    customModelInput,
    localVisualStyle,
    customStyleInput,
    project.rawScript,
    project.title,
    project.targetDuration,
    project.language,
    project.shotGenerationModel,
    project.visualStyle,
    updateProject
  ]);

  const handleAnalyze = async () => {
    const finalDuration = getFinalValue(localDuration, customDurationInput);
    const finalModel = getFinalValue(localModel, customModelInput);
    const finalVisualStyle = getFinalValue(localVisualStyle, customStyleInput);

    const validation = validateConfig({
      script: localScript,
      duration: finalDuration,
      model: finalModel,
      visualStyle: finalVisualStyle
    });

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const analyzeConfigKey = buildAnalyzeConfigKey({
      script: localScript,
      language: localLanguage,
      targetDuration: finalDuration,
      model: finalModel,
      visualStyle: finalVisualStyle
    });
    const savedCheckpoint = project.scriptGenerationCheckpoint;
    const resumeCheckpoint =
      savedCheckpoint && savedCheckpoint.configKey === analyzeConfigKey
        ? savedCheckpoint
        : null;

    let nextStep: ScriptGenerationStep = resumeCheckpoint?.step || 'structure';
    let workingScriptData: ScriptData | null = resumeCheckpoint?.scriptData || null;

    analyzeAbortControllerRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortControllerRef.current = controller;

    console.log('📌 用户选择的模型:', localModel);
    console.log('📌 最终使用的模型:', finalModel);
    console.log('🎨 视觉风格:', finalVisualStyle);
    logScriptProgress(`已选择模型：${localModel}`);
    logScriptProgress(`最终使用模型：${finalModel}`);
    logScriptProgress(`视觉风格：${finalVisualStyle}`);
    if (resumeCheckpoint) {
      logScriptProgress(`检测到断点，将从 ${resumeCheckpoint.step} 步骤继续`);
    }

    setIsProcessing(true);
    setProcessingMessage('正在准备生成流程...');
    setProcessingLogs([]);
    setError(null);

    try {
      updateProject({
        title: localTitle,
        rawScript: localScript,
        targetDuration: finalDuration,
        language: localLanguage,
        visualStyle: finalVisualStyle,
        shotGenerationModel: finalModel,
        isParsingScript: true,
        scriptGenerationCheckpoint: createAnalyzeCheckpoint(nextStep, analyzeConfigKey, workingScriptData)
      });

      if (nextStep === 'structure' || !workingScriptData) {
        setProcessingMessage('正在解析剧本结构...');
        logScriptProgress('开始解析剧本结构...');
        const structured = await parseScriptStructure(
          localScript,
          localLanguage,
          finalModel,
          controller.signal
        );
        workingScriptData = hydrateScriptDataMeta(structured, {
          targetDuration: finalDuration,
          language: localLanguage,
          visualStyle: finalVisualStyle,
          model: finalModel,
          localTitle
        });
        nextStep = 'visuals';
        updateProject({
          scriptData: workingScriptData,
          isParsingScript: true,
          scriptGenerationCheckpoint: createAnalyzeCheckpoint(nextStep, analyzeConfigKey, workingScriptData)
        });
      }

      if (nextStep === 'visuals') {
        setProcessingMessage('正在生成角色/场景/道具视觉提示词...');
        logScriptProgress('开始生成视觉提示词...');
        const enriched = await enrichScriptDataVisuals(
          workingScriptData!,
          finalModel,
          finalVisualStyle,
          localLanguage,
          { abortSignal: controller.signal }
        );
        workingScriptData = hydrateScriptDataMeta(enriched, {
          targetDuration: finalDuration,
          language: localLanguage,
          visualStyle: finalVisualStyle,
          model: finalModel,
          localTitle
        });
        nextStep = 'shots';
        updateProject({
          scriptData: workingScriptData,
          isParsingScript: true,
          scriptGenerationCheckpoint: createAnalyzeCheckpoint(nextStep, analyzeConfigKey, workingScriptData)
        });
      }

      setProcessingMessage('正在生成分镜...');
      logScriptProgress('开始生成分镜...');
      const shots = await generateShotList(workingScriptData!, finalModel, controller.signal);

      if (project.projectId) {
        try {
          const seriesProject = await loadSeriesProject(project.projectId);
          if (seriesProject) {
            const matches = findAssetMatches(workingScriptData!, seriesProject);
            if (matches.hasAnyMatch) {
              setPendingParseResult({
                scriptData: workingScriptData!,
                shots,
                matches,
                title: workingScriptData!.title
              });
              updateProject({
                scriptData: workingScriptData!,
                isParsingScript: false,
                scriptGenerationCheckpoint: null
              });
              setIsProcessing(false);
              setProcessingMessage('');
              return;
            }
          }
        } catch (e) {
          console.warn('Asset match check failed, proceeding without match:', e);
        }
      }

      updateProject({
        scriptData: workingScriptData!,
        shots,
        characterRefs: [],
        sceneRefs: [],
        propRefs: [],
        isParsingScript: false,
        title: workingScriptData!.title,
        scriptGenerationCheckpoint: null
      });

      setActiveTab('script');
    } catch (err: any) {
      console.error(err);
      if (isAbortError(err, controller.signal)) {
        setError('已取消生成，可点击“继续生成分镜脚本”从断点继续。');
        logScriptProgress('生成已取消，可点击继续按钮从断点续跑。');
      } else {
        setError(`错误: ${err.message || 'AI 连接失败'}`);
      }
      updateProject({ isParsingScript: false });
    } finally {
      if (analyzeAbortControllerRef.current === controller) {
        analyzeAbortControllerRef.current = null;
      }
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleCancelAnalyze = () => {
    if (!isProcessing) return;
    analyzeAbortControllerRef.current?.abort();
    setProcessingMessage('正在取消生成...');
    logScriptProgress('正在取消当前生成流程...');
  };

  const handleAssetMatchConfirm = (finalMatches: AssetMatchResult) => {
    if (!pendingParseResult) return;
    const { scriptData, shots } = pendingParseResult;
    const result = applyAssetMatches(scriptData, shots, finalMatches);

    updateProject({
      scriptData: result.scriptData,
      shots: result.shots,
      characterRefs: result.characterRefs,
      sceneRefs: result.sceneRefs,
      propRefs: result.propRefs,
      isParsingScript: false,
      title: result.scriptData.title,
      scriptGenerationCheckpoint: null,
    });

    setPendingParseResult(null);
    setActiveTab('script');
  };

  const handleAssetMatchCancel = () => {
    if (!pendingParseResult) return;
    const { scriptData, shots, title } = pendingParseResult;

    updateProject({
      scriptData,
      shots,
      characterRefs: [],
      sceneRefs: [],
      propRefs: [],
      isParsingScript: false,
      title,
      scriptGenerationCheckpoint: null,
    });

    setPendingParseResult(null);
    setActiveTab('script');
  };

  const handleContinueScript = async () => {
    const finalModel = getFinalValue(localModel, customModelInput);
    
    if (!localScript.trim()) {
      setError("请先输入一些剧本内容作为基础。");
      return;
    }
    if (!finalModel) {
      setError("请选择或输入模型名称。");
      return;
    }

    setIsContinuing(true);
    setProcessingMessage('AI续写中...');
    setProcessingLogs([]);
    setError(null);
    const baseScript = localScript;
    let streamed = '';
    try {
      const continuedContent = await continueScriptStream(
        baseScript,
        localLanguage,
        finalModel,
        (delta) => {
          streamed += delta;
          const newScript = baseScript + '\n\n' + streamed;
          setLocalScript(newScript);
          updateProject({ rawScript: newScript });
        }
      );
      if (continuedContent) {
        const newScript = baseScript + '\n\n' + continuedContent;
        setLocalScript(newScript);
        updateProject({ rawScript: newScript });
      }
    } catch (err: any) {
      console.error(err);
      setError(`AI续写失败: ${err.message || "连接失败"}`);
      try {
        const continuedContent = await continueScript(baseScript, localLanguage, finalModel);
        const newScript = baseScript + '\n\n' + continuedContent;
        setLocalScript(newScript);
        updateProject({ rawScript: newScript });
      } catch (fallbackErr: any) {
        console.error(fallbackErr);
      }
    } finally {
      setIsContinuing(false);
      setProcessingMessage('');
    }
  };

  const handleRewriteScript = async () => {
    const finalModel = getFinalValue(localModel, customModelInput);
    
    if (!localScript.trim()) {
      setError("请先输入剧本内容。");
      return;
    }
    if (!finalModel) {
      setError("请选择或输入模型名称。");
      return;
    }

    setIsRewriting(true);
    setProcessingMessage('AI改写中...');
    setProcessingLogs([]);
    setError(null);
    const baseScript = localScript;
    let streamed = '';
    try {
      const rewrittenContent = await rewriteScriptStream(
        baseScript,
        localLanguage,
        finalModel,
        (delta) => {
          streamed += delta;
          setLocalScript(streamed);
        }
      );
      const finalContent = (rewrittenContent || streamed).trim();
      if (!finalContent) {
        throw new Error('AI 未返回改写内容');
      }
      if (finalContent !== baseScript) {
        setLastRewriteSnapshot(baseScript);
      }
      setLocalScript(finalContent);
      updateProject({ rawScript: finalContent });
    } catch (streamErr: any) {
      console.error(streamErr);
      try {
        const rewrittenContent = await rewriteScript(baseScript, localLanguage, finalModel);
        if (!rewrittenContent.trim()) {
          throw new Error('AI 未返回改写内容');
        }
        if (rewrittenContent !== baseScript) {
          setLastRewriteSnapshot(baseScript);
        }
        setLocalScript(rewrittenContent);
        updateProject({ rawScript: rewrittenContent });
      } catch (fallbackErr: any) {
        console.error(fallbackErr);
        setLocalScript(baseScript);
        updateProject({ rawScript: baseScript });
        setError(`AI改写失败，已恢复原稿: ${fallbackErr.message || streamErr?.message || "连接失败"}`);
      }
    } finally {
      setIsRewriting(false);
      setProcessingMessage('');
    }
  };

  const handleSelectionChange = (start: number, end: number) => {
    if (end <= start) {
      setSelectionRange(null);
      return;
    }
    setSelectionRange({ start, end });
  };

  const selectedText = selectionRange
    ? localScript.slice(selectionRange.start, selectionRange.end)
    : '';

  const handleRewriteSelection = async () => {
    const finalModel = getFinalValue(localModel, customModelInput);
    const currentSelection = selectionRange;
    const trimmedInstruction = rewriteInstruction.trim();

    if (!localScript.trim()) {
      setError('请先输入剧本内容。');
      return;
    }
    if (!currentSelection || currentSelection.end <= currentSelection.start) {
      setError('请先在编辑区选择需要改写的段落。');
      return;
    }
    if (!trimmedInstruction) {
      setError('请输入改写要求。');
      return;
    }
    if (!finalModel) {
      setError('请选择或输入模型名称。');
      return;
    }

    const baseScript = localScript;
    const selectedSegment = baseScript.slice(currentSelection.start, currentSelection.end);

    if (!selectedSegment.trim()) {
      setError('选中内容为空，请重新选择段落。');
      return;
    }

    const prefix = baseScript.slice(0, currentSelection.start);
    const suffix = baseScript.slice(currentSelection.end);

    setIsRewriting(true);
    setProcessingMessage('AI选段改写中...');
    setProcessingLogs([]);
    setError(null);

    let streamed = '';

    try {
      const rewrittenSegment = await rewriteScriptSegmentStream(
        baseScript,
        selectedSegment,
        trimmedInstruction,
        localLanguage,
        finalModel,
        (delta) => {
          streamed += delta;
          const nextScript = prefix + streamed + suffix;
          setLocalScript(nextScript);
          updateProject({ rawScript: nextScript });
        }
      );

      const finalSegment = rewrittenSegment || streamed;
      const nextScript = prefix + finalSegment + suffix;
      if (nextScript !== baseScript) {
        setLastRewriteSnapshot(baseScript);
      }
      setLocalScript(nextScript);
      updateProject({ rawScript: nextScript });
      setSelectionRange({
        start: currentSelection.start,
        end: currentSelection.start + finalSegment.length,
      });
    } catch (err: any) {
      console.error(err);
      setError(`AI选段改写失败: ${err.message || '连接失败'}`);
      try {
        const rewrittenSegment = await rewriteScriptSegment(
          baseScript,
          selectedSegment,
          trimmedInstruction,
          localLanguage,
          finalModel
        );
        const nextScript = prefix + rewrittenSegment + suffix;
        if (nextScript !== baseScript) {
          setLastRewriteSnapshot(baseScript);
        }
        setLocalScript(nextScript);
        updateProject({ rawScript: nextScript });
        setSelectionRange({
          start: currentSelection.start,
          end: currentSelection.start + rewrittenSegment.length,
        });
      } catch (fallbackErr: any) {
        console.error(fallbackErr);
      }
    } finally {
      setIsRewriting(false);
      setProcessingMessage('');
    }
  };

  const handleUndoRewrite = () => {
    if (!lastRewriteSnapshot) return;

    setLocalScript(lastRewriteSnapshot);
    updateProject({ rawScript: lastRewriteSnapshot });
    setSelectionRange(null);
    setLastRewriteSnapshot(null);
    showAlert('已撤回上次改写', { type: 'success' });
  };

  const draftAnalyzeConfigKey = buildAnalyzeConfigKey({
    script: localScript,
    language: localLanguage,
    targetDuration: getDraftValue(localDuration, customDurationInput, project.targetDuration || DEFAULTS.duration),
    model: getDraftValue(localModel, customModelInput, project.shotGenerationModel || DEFAULTS.model),
    visualStyle: getDraftValue(localVisualStyle, customStyleInput, project.visualStyle || DEFAULTS.visualStyle)
  });
  const analyzeCheckpoint = project.scriptGenerationCheckpoint;
  const hasResumeCheckpoint =
    !!analyzeCheckpoint &&
    analyzeCheckpoint.configKey === draftAnalyzeConfigKey &&
    !!analyzeCheckpoint.scriptData;
  const analyzeButtonLabel =
    hasResumeCheckpoint && analyzeCheckpoint?.step !== 'structure'
      ? '继续生成分镜脚本'
      : '生成分镜脚本';

  const showProcessingToast = isProcessing || isContinuing || isRewriting;
  const toastMessage = processingMessage || (isProcessing
    ? '正在生成剧本...'
    : isContinuing
      ? 'AI续写中...'
      : isRewriting
        ? 'AI改写中...'
        : '');

  // Character editing handlers
  const handleEditCharacter = (charId: string, prompt: string) => {
    setEditingCharacterId(charId);
    setEditingCharacterPrompt(prompt);
  };

  const handleSaveCharacter = (charId: string, prompt: string) => {
    if (!project.scriptData) return;
    
    const updatedCharacters = project.scriptData.characters.map(c => 
      c.id === charId ? { ...c, visualPrompt: prompt } : c
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

  // Shot prompt editing handlers
  const handleEditShotPrompt = (shotId: string, prompt: string) => {
    setEditingShotId(shotId);
    setEditingShotPrompt(prompt);
  };

  const handleSaveShotPrompt = () => {
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

  const handleCancelShotPrompt = () => {
    setEditingShotId(null);
    setEditingShotPrompt('');
  };

  // Shot characters editing handlers
  const handleEditShotCharacters = (shotId: string) => {
    setEditingShotCharactersId(shotId);
  };

  const handleAddCharacterToShot = (shotId: string, characterId: string) => {
    const updatedShots = project.shots.map(shot => {
      if (shot.id === shotId && !shot.characters.includes(characterId)) {
        return { ...shot, characters: [...shot.characters, characterId] };
      }
      return shot;
    });
    updateProject({ shots: updatedShots });
  };

  const handleRemoveCharacterFromShot = (shotId: string, characterId: string) => {
    const updatedShots = project.shots.map(shot => {
      if (shot.id === shotId) {
        return { ...shot, characters: shot.characters.filter(cid => cid !== characterId) };
      }
      return shot;
    });
    updateProject({ shots: updatedShots });
  };

  const handleCloseShotCharactersEdit = () => {
    setEditingShotCharactersId(null);
  };

  // Shot action editing handlers
  const handleEditShotAction = (shotId: string, action: string, dialogue: string) => {
    setEditingShotActionId(shotId);
    setEditingShotActionText(action);
    setEditingShotDialogueText(dialogue);
  };

  const handleSaveShotAction = () => {
    if (!editingShotActionId) return;
    
    const updatedShots = project.shots.map(shot => {
      if (shot.id === editingShotActionId) {
        return {
          ...shot,
          actionSummary: editingShotActionText,
          dialogue: editingShotDialogueText.trim() || undefined
        };
      }
      return shot;
    });
    
    updateProject({ shots: updatedShots });
    setEditingShotActionId(null);
    setEditingShotActionText('');
    setEditingShotDialogueText('');
  };

  const handleCancelShotAction = () => {
    setEditingShotActionId(null);
    setEditingShotActionText('');
    setEditingShotDialogueText('');
  };

  const getNextShotId = (shots: Shot[]) => {
    const maxMain = shots.reduce((max, shot) => {
      const parts = shot.id.split('-');
      const main = Number(parts[1]);
      if (!Number.isFinite(main)) return max;
      return Math.max(max, main);
    }, 0);
    return `shot-${maxMain + 1}`;
  };

  const handleAddSubShot = (anchorShotId: string) => {
    const anchorShot = project.shots.find(s => s.id === anchorShotId);
    if (!anchorShot) return;

    const parts = anchorShotId.split('-');
    const main = Number(parts[1]);
    if (!Number.isFinite(main)) return;

    const baseId = `shot-${main}`;
    const maxSuffix = project.shots.reduce((max, shot) => {
      if (!shot.id.startsWith(`${baseId}-`)) return max;
      const subParts = shot.id.split('-');
      const suffix = Number(subParts[2]);
      if (!Number.isFinite(suffix)) return max;
      return Math.max(max, suffix);
    }, 0);

    const newId = `${baseId}-${maxSuffix + 1}`;
    const baseShot = project.shots.find(s => s.id === baseId) || anchorShot;
    const newShot: Shot = {
      id: newId,
      sceneId: baseShot.sceneId,
      actionSummary: '在此输入动作描述',
      cameraMovement: baseShot.cameraMovement || '平移',
      shotSize: baseShot.shotSize || '中景',
      characters: [...(baseShot.characters || [])],
      characterVariations: baseShot.characterVariations ? { ...baseShot.characterVariations } : undefined,
      props: baseShot.props ? [...baseShot.props] : undefined,
      videoModel: baseShot.videoModel,
      keyframes: [
        {
          id: `kf-${newId}-start`,
          type: 'start',
          visualPrompt: '',
          status: 'pending'
        }
      ]
    };

    const lastIndexInGroup = project.shots.reduce((idx, shot, i) => {
      const isGroup = shot.id === baseId || shot.id.startsWith(`${baseId}-`);
      return isGroup ? i : idx;
    }, -1);

    const insertAt = lastIndexInGroup >= 0 ? lastIndexInGroup + 1 : project.shots.length;
    const nextShots = [
      ...project.shots.slice(0, insertAt),
      newShot,
      ...project.shots.slice(insertAt)
    ];

    updateProject({ shots: nextShots });
    setEditingShotActionId(newId);
    setEditingShotActionText(newShot.actionSummary);
    setEditingShotDialogueText('');
  };

  const handleAddShot = (sceneId: string) => {
    if (!project.scriptData) return;

    const sceneShots = project.shots.filter(s => s.sceneId === sceneId);
    if (sceneShots.length > 0) {
      handleAddSubShot(sceneShots[sceneShots.length - 1].id);
      return;
    }

    const newId = getNextShotId(project.shots);
    const newShot: Shot = {
      id: newId,
      sceneId,
      actionSummary: '在此输入动作描述',
      cameraMovement: '平移',
      shotSize: '中景',
      characters: [],
      keyframes: [
        {
          id: `kf-${newId}-start`,
          type: 'start',
          visualPrompt: '',
          status: 'pending'
        }
      ]
    };

    const sceneIndex = project.scriptData.scenes.findIndex(s => s.id === sceneId);
    const lastIndexInScene = project.shots.reduce((idx, shot, i) => (
      shot.sceneId === sceneId ? i : idx
    ), -1);

    let insertAt = project.shots.length;
    if (lastIndexInScene >= 0) {
      insertAt = lastIndexInScene + 1;
    } else if (sceneIndex >= 0) {
      for (let i = sceneIndex + 1; i < project.scriptData.scenes.length; i += 1) {
        const nextSceneId = project.scriptData.scenes[i].id;
        const nextIndex = project.shots.findIndex(s => s.sceneId === nextSceneId);
        if (nextIndex >= 0) {
          insertAt = nextIndex;
          break;
        }
      }
    }

    const nextShots = [
      ...project.shots.slice(0, insertAt),
      newShot,
      ...project.shots.slice(insertAt)
    ];

    updateProject({ shots: nextShots });
    setEditingShotActionId(newId);
    setEditingShotActionText(newShot.actionSummary);
    setEditingShotDialogueText('');
  };

  const getShotDisplayName = (shot: Shot, fallbackIndex: number) => {
    const idParts = shot.id.split('-').slice(1);
    if (idParts.length === 1) {
      return `SHOT ${String(idParts[0]).padStart(3, '0')}`;
    }
    if (idParts.length === 2) {
      return `SHOT ${String(idParts[0]).padStart(3, '0')}-${idParts[1]}`;
    }
    return `SHOT ${String(fallbackIndex + 1).padStart(3, '0')}`;
  };

  const handleDeleteShot = (shotId: string) => {
    const shotIndex = project.shots.findIndex(s => s.id === shotId);
    const shot = shotIndex >= 0 ? project.shots[shotIndex] : null;
    if (!shot) return;

    const displayName = getShotDisplayName(shot, shotIndex);
    showAlert(`确定要删除 ${displayName} 吗？此操作不可撤销。`, {
      type: 'warning',
      showCancel: true,
      onConfirm: () => {
        updateProject({ shots: project.shots.filter(s => s.id !== shotId) });
        if (editingShotId === shotId) {
          setEditingShotId(null);
          setEditingShotPrompt('');
        }
        if (editingShotCharactersId === shotId) {
          setEditingShotCharactersId(null);
        }
        if (editingShotActionId === shotId) {
          setEditingShotActionId(null);
          setEditingShotActionText('');
          setEditingShotDialogueText('');
        }
        showAlert(`${displayName} 已删除`, { type: 'success' });
      }
    });
  };

  return (
    <div className="h-full bg-[var(--bg-base)]">
      {showProcessingToast && (
        <div className="fixed right-4 top-4 z-[9999] w-full max-w-md rounded-xl border border-[var(--border-default)] bg-black/80 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
            <div className="text-sm text-white">{toastMessage}</div>
          </div>
          {processingLogs.length > 0 && (
            <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-zinc-300">
              {processingLogs.map((line, index) => (
                <div key={`${line}-${index}`} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          )}
          {isProcessing && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleCancelAnalyze}
                className="rounded border border-zinc-400/60 px-2 py-1 text-[11px] text-white/90 transition-colors hover:border-white hover:text-white"
              >
                取消生成
              </button>
            </div>
          )}
        </div>
      )}
      {activeTab === 'story' ? (
        <div className="flex h-full bg-[var(--bg-base)] text-[var(--text-secondary)]">
          <ConfigPanel
            title={localTitle}
            duration={localDuration}
            language={localLanguage}
            model={localModel}
            visualStyle={localVisualStyle}
            customDurationInput={customDurationInput}
            customModelInput={customModelInput}
            customStyleInput={customStyleInput}
            isProcessing={isProcessing}
            error={error}
            onShowModelConfig={onShowModelConfig}
            onTitleChange={setLocalTitle}
            onDurationChange={setLocalDuration}
            onLanguageChange={setLocalLanguage}
            onModelChange={setLocalModel}
            onVisualStyleChange={setLocalVisualStyle}
            onCustomDurationChange={setCustomDurationInput}
            onCustomModelChange={setCustomModelInput}
            onCustomStyleChange={setCustomStyleInput}
            onAnalyze={handleAnalyze}
            analyzeButtonLabel={analyzeButtonLabel}
            canCancelAnalyze={!!analyzeAbortControllerRef.current}
            onCancelAnalyze={handleCancelAnalyze}
          />
          <ScriptEditor
            script={localScript}
            onChange={setLocalScript}
            onContinue={handleContinueScript}
            onRewrite={handleRewriteScript}
            onSelectionChange={handleSelectionChange}
            selectedText={selectedText}
            rewriteInstruction={rewriteInstruction}
            onRewriteInstructionChange={setRewriteInstruction}
            onRewriteSelection={handleRewriteSelection}
            onUndoRewrite={handleUndoRewrite}
            canUndoRewrite={!!lastRewriteSnapshot}
            isContinuing={isContinuing}
            isRewriting={isRewriting}
            lastModified={project.lastModified}
          />
        </div>
      ) : (
        <SceneBreakdown
          project={project}
          editingCharacterId={editingCharacterId}
          editingCharacterPrompt={editingCharacterPrompt}
          editingShotId={editingShotId}
          editingShotPrompt={editingShotPrompt}
          editingShotCharactersId={editingShotCharactersId}
          editingShotActionId={editingShotActionId}
          editingShotActionText={editingShotActionText}
          editingShotDialogueText={editingShotDialogueText}
          onEditCharacter={handleEditCharacter}
          onSaveCharacter={handleSaveCharacter}
          onCancelCharacterEdit={handleCancelCharacterEdit}
          onEditShotPrompt={handleEditShotPrompt}
          onSaveShotPrompt={handleSaveShotPrompt}
          onCancelShotPrompt={handleCancelShotPrompt}
          onEditShotCharacters={handleEditShotCharacters}
          onAddCharacterToShot={handleAddCharacterToShot}
          onRemoveCharacterFromShot={handleRemoveCharacterFromShot}
          onCloseShotCharactersEdit={handleCloseShotCharactersEdit}
          onEditShotAction={handleEditShotAction}
          onSaveShotAction={handleSaveShotAction}
          onCancelShotAction={handleCancelShotAction}
          onAddShot={handleAddShot}
          onAddSubShot={handleAddSubShot}
          onDeleteShot={handleDeleteShot}
          onBackToStory={() => setActiveTab('story')}
        />
      )}

      {pendingParseResult && (
        <AssetMatchDialog
          matches={pendingParseResult.matches}
          onConfirm={handleAssetMatchConfirm}
          onCancel={handleAssetMatchCancel}
        />
      )}
    </div>
  );
};

export default StageScript;


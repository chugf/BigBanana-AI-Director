import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Film,
  Edit2,
  MessageSquare,
  Sparkles,
  Loader2,
  Scissors,
  Grid3x3,
  CircleHelp,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { Shot, ProjectState, AspectRatio, VideoDuration, NineGridData, NineGridPanel } from '../../types';
import SceneContext from './SceneContext';
import KeyframeEditor from './KeyframeEditor';
import VideoGenerator from './VideoGenerator';
import { resolveVideoModelRouting } from './utils';

interface ShotWorkbenchProps {
  shot: Shot;
  shotIndex: number;
  totalShots: number;
  scriptData?: ProjectState['scriptData'];
  currentVideoModelId: string;
  nextShotHasStartFrame?: boolean;
  isAIOptimizing?: boolean;
  isAIReassessing?: boolean;
  isSplittingShot?: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onAIReassessQuality: () => void;
  onEditActionSummary: () => void;
  onGenerateAIAction: () => void;
  onSplitShot: () => void;
  onAddCharacter: (charId: string) => void;
  onRemoveCharacter: (charId: string) => void;
  onVariationChange: (charId: string, varId: string) => void;
  onSceneChange: (sceneId: string) => void;
  onAddProp?: (propId: string) => void;
  onRemoveProp?: (propId: string) => void;
  onGenerateKeyframe: (type: 'start' | 'end') => void;
  onUploadKeyframe: (type: 'start' | 'end') => void;
  onEditKeyframePrompt: (type: 'start' | 'end', prompt: string) => void;
  onOptimizeKeyframeWithAI: (type: 'start' | 'end') => void;
  onOptimizeBothKeyframes: () => void;
  onCopyPreviousEndFrame: () => void;
  onCopyNextStartFrame: () => void;
  useAIEnhancement: boolean;
  onToggleAIEnhancement: () => void;
  onGenerateVideo: (aspectRatio: AspectRatio, duration: VideoDuration, modelId: string) => void;
  onEditVideoPrompt: () => void;
  onVideoModelChange: (modelId: string) => void;
  onImageClick: (url: string, title: string) => void;
  onGenerateNineGrid: () => void;
  nineGrid?: NineGridData;
  onSelectNineGridPanel: (panel: NineGridPanel) => void;
  onShowNineGrid: () => void;
}

type SectionKey = 'quality' | 'context' | 'keyframe' | 'narrative' | 'video' | 'advanced';

const ShotWorkbench: React.FC<ShotWorkbenchProps> = ({
  shot,
  shotIndex,
  totalShots,
  scriptData,
  currentVideoModelId,
  nextShotHasStartFrame = false,
  isAIOptimizing = false,
  isAIReassessing = false,
  isSplittingShot = false,
  onClose,
  onPrevious,
  onNext,
  onAIReassessQuality,
  onEditActionSummary,
  onGenerateAIAction,
  onSplitShot,
  onAddCharacter,
  onRemoveCharacter,
  onVariationChange,
  onSceneChange,
  onAddProp,
  onRemoveProp,
  onGenerateKeyframe,
  onUploadKeyframe,
  onEditKeyframePrompt,
  onOptimizeKeyframeWithAI,
  onOptimizeBothKeyframes,
  onCopyPreviousEndFrame,
  onCopyNextStartFrame,
  useAIEnhancement,
  onToggleAIEnhancement,
  onGenerateVideo,
  onEditVideoPrompt,
  onVideoModelChange,
  onImageClick,
  onGenerateNineGrid,
  nineGrid,
  onSelectNineGridPanel,
  onShowNineGrid,
}) => {
  const scene = scriptData?.scenes.find((s) => String(s.id) === String(shot.sceneId));
  const activeCharacters = scriptData?.characters.filter((c) => shot.characters.includes(c.id)) || [];
  const availableCharacters = scriptData?.characters.filter((c) => !shot.characters.includes(c.id)) || [];
  const activeProps = (scriptData?.props || []).filter((p) => (shot.props || []).includes(p.id));
  const availablePropsForShot = (scriptData?.props || []).filter((p) => !(shot.props || []).includes(p.id));

  const startKf = shot.keyframes?.find((k) => k.type === 'start');
  const endKf = shot.keyframes?.find((k) => k.type === 'end');
  const quality = shot.qualityAssessment;
  const [localVideoModelId, setLocalVideoModelId] = useState(currentVideoModelId);
  const [expandedCheckKey, setExpandedCheckKey] = useState<string | null>(null);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SectionKey>('context');

  useEffect(() => {
    setLocalVideoModelId(currentVideoModelId);
  }, [currentVideoModelId]);

  const modelRouting = resolveVideoModelRouting(localVideoModelId || currentVideoModelId || 'sora-2');
  const showEndFrame = modelRouting.supportsEndFrame;
  const hasStartFrame = !!startKf?.imageUrl;
  const hasEndFrame = !!endKf?.imageUrl;
  const keyframeReady = hasStartFrame && (!showEndFrame || hasEndFrame);
  const hasActionSummary = (shot.actionSummary || '').trim().length > 0;
  const hasVideo = !!shot.interval?.videoUrl;
  const isVideoGenerating = shot.interval?.status === 'generating';

  useEffect(() => {
    if (!hasStartFrame || (showEndFrame && !hasEndFrame)) {
      setExpandedSection('keyframe');
      return;
    }
    if (!hasVideo) {
      setExpandedSection('video');
      return;
    }
    setExpandedSection('quality');
  }, [shot.id]);

  useEffect(() => {
    setExpandedCheckKey(null);
  }, [shot.id]);

  const qualityGradeLabel = quality?.grade === 'pass' ? '通过' : quality?.grade === 'warning' ? '需优化' : '高风险';
  const qualityBadgeClass =
    quality?.grade === 'pass'
      ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
      : quality?.grade === 'warning'
        ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]'
        : 'bg-[var(--error-hover-bg)] text-[var(--error-text)] border-[var(--error-border)]';
  const qualitySourceLabel = quality ? (quality.version >= 2 ? 'AI评估 V2' : '规则评分 V1') : '';

  const checkLabelMap: Record<string, string> = {
    'prompt-readiness': '提示词完整度',
    'asset-coverage': '资产覆盖度',
    'keyframe-execution': '关键帧就绪度',
    'video-execution': '视频执行状态',
    'continuity-risk': '连贯性风险',
  };

  const adviceMap: Record<string, string> = {
    'prompt-readiness': '建议先补全首帧/尾帧/视频提示词，避免执行歧义。',
    'asset-coverage': '建议补角色/场景/道具参考图，提高风格一致性。',
    'keyframe-execution': '建议先完成关键帧出图，再进入视频生成。',
    'video-execution': '建议优先完成视频生成并确认可播放结果。',
    'continuity-risk': '建议补齐首尾锚点，确保跨镜头连贯。',
  };

  const getCheckLabel = (checkKey: string, fallback: string) => checkLabelMap[checkKey] || fallback;

  const qualitySummary = (() => {
    if (!quality) return '';
    const failedLabels = quality.checks.filter((check) => !check.passed).map((check) => getCheckLabel(check.key, check.label));
    if (failedLabels.length === 0) return '可进入生产，核心检查项已通过。';
    if (quality.grade === 'fail') return `风险较高：${failedLabels.join('、')}`;
    if (quality.grade === 'warning') return `需要优化：${failedLabels.join('、')}`;
    return `轻微问题：${failedLabels.join('、')}`;
  })();

  const weakestCheck = quality?.checks?.length
    ? [...quality.checks].sort((a, b) => a.score - b.score)[0]
    : undefined;
  const qualityActionHint = weakestCheck ? adviceMap[weakestCheck.key] || '' : '';

  const steps = useMemo(
    () => [
      { key: 'context' as const, label: '1 资产绑定', done: !!scene && activeCharacters.length > 0 },
      { key: 'keyframe' as const, label: '2 关键帧', done: keyframeReady },
      { key: 'narrative' as const, label: '3 动作台词', done: hasActionSummary },
      { key: 'video' as const, label: '4 视频生成', done: hasVideo },
    ],
    [scene, activeCharacters.length, keyframeReady, hasActionSummary, hasVideo]
  );
  const completedSteps = steps.filter((item) => item.done).length;

  const primaryAction = useMemo(() => {
    if (!hasStartFrame) {
      return {
        label: '下一步：生成首帧',
        hint: '先生成首帧，建立镜头视觉锚点。',
        disabled: startKf?.status === 'generating',
        onClick: () => {
          setExpandedSection('keyframe');
          onGenerateKeyframe('start');
        },
      };
    }

    if (showEndFrame && !hasEndFrame) {
      return {
        label: '下一步：生成尾帧',
        hint: '补齐首尾关键帧后，再做视频会更稳定。',
        disabled: endKf?.status === 'generating',
        onClick: () => {
          setExpandedSection('keyframe');
          onGenerateKeyframe('end');
        },
      };
    }

    if (!hasVideo) {
      return {
        label: isVideoGenerating ? '视频生成中...' : '下一步：进入视频生成',
        hint: isVideoGenerating ? '当前镜头正在出片，请稍候。' : '在步骤 4 选择模型和参数后生成视频。',
        disabled: isVideoGenerating,
        onClick: () => setExpandedSection('video'),
      };
    }

    return {
      label: isAIReassessing ? 'AI评估中...' : '下一步：AI重评估',
      hint: '视频已完成，建议做一次最终可交付性评估。',
      disabled: isAIReassessing,
      onClick: () => {
        setExpandedSection('quality');
        onAIReassessQuality();
      },
    };
  }, [
    hasStartFrame,
    startKf?.status,
    showEndFrame,
    hasEndFrame,
    endKf?.status,
    hasVideo,
    isVideoGenerating,
    isAIReassessing,
    onGenerateKeyframe,
    onAIReassessQuality,
  ]);

  const getShotDisplayNumber = () => {
    const idParts = shot.id.split('-').slice(1);
    if (idParts.length === 1) return String(idParts[0]).padStart(2, '0');
    if (idParts.length === 2) return `${String(idParts[0]).padStart(2, '0')}-${idParts[1]}`;
    return String(shotIndex + 1).padStart(2, '0');
  };

  const renderSectionHeader = (
    sectionKey: SectionKey,
    title: string,
    subtitle: string,
    done?: boolean
  ) => {
    const isOpen = expandedSection === sectionKey;
    return (
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        onClick={() => setExpandedSection(isOpen ? 'quality' : sectionKey)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {done === undefined ? null : done ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--success-text)] shrink-0" />
          ) : (
            <Circle className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">{title}</p>
            <p className="text-[10px] text-[var(--text-muted)] truncate">{subtitle}</p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>
    );
  };

  return (
    <div className="w-[500px] bg-[var(--bg-deep)] flex flex-col h-full shadow-2xl animate-in slide-in-from-right-10 duration-300 relative z-20">
      <div className="h-16 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <span className="min-w-[3rem] h-8 px-2 bg-[var(--accent-bg)] text-[var(--accent-text)] rounded-lg flex items-center justify-center font-bold font-mono text-[11px] whitespace-nowrap border border-[var(--accent-border)] shrink-0">
            {getShotDisplayNumber()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[var(--text-primary)] font-bold text-sm">镜头详情</h3>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest truncate" title={shot.cameraMovement}>
              {shot.cameraMovement}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-base)]/40 mr-2">
            <button
              type="button"
              className={`px-2 py-1 text-[10px] font-medium ${!isAdvancedMode ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-tertiary)]'}`}
              onClick={() => setIsAdvancedMode(false)}
              title="仅显示核心流程，降低复杂度"
            >
              新手
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-[10px] font-medium ${isAdvancedMode ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-tertiary)]'}`}
              onClick={() => setIsAdvancedMode(true)}
              title="显示九宫格和拆镜等高级工具"
            >
              高级
            </button>
          </div>
          <button
            onClick={onPrevious}
            disabled={shotIndex === 0}
            className="p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onNext}
            disabled={shotIndex === totalShots - 1}
            className="p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-[var(--border-secondary)] mx-2" />
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--error-hover-bg)] rounded text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] overflow-hidden">
          {renderSectionHeader('quality', '质量评估', '查看当前镜头可交付性')}
          {expandedSection === 'quality' && quality && (
            <div className="px-4 pb-4 border-t border-[var(--border-primary)] space-y-2">
              <div className="pt-3 flex items-center justify-between gap-2">
                <span className={`px-2 py-1 rounded-md text-[10px] font-mono border ${qualityBadgeClass}`}>
                  评分 {quality.score} · {qualityGradeLabel}
                </span>
                <button
                  type="button"
                  onClick={onAIReassessQuality}
                  disabled={isAIReassessing}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold border border-[var(--accent-border)] text-[var(--accent-text)] hover:bg-[var(--accent-bg)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                  title="使用大模型重新评估当前镜头质量"
                >
                  {isAIReassessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isAIReassessing ? '评估中...' : 'AI重评估'}
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{qualitySummary}</p>
              {qualityActionHint && (
                <p className="text-[10px] text-[var(--accent-text)] bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded px-2 py-1.5">
                  下一步建议：{qualityActionHint}
                </p>
              )}
              <p className="text-[10px] text-[var(--text-muted)]">
                来源：{qualitySourceLabel} · 评分时间：{new Date(quality.generatedAt).toLocaleString()}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">注：这里显示的是总分和等级，不是“warning条数”。点击每项右侧 ? 可查看评分依据。</p>
              <div className="space-y-1.5">
                {quality.checks.map((check) => (
                  <div key={check.key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-16 text-[10px] font-mono ${check.passed ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]'}`}>
                        {check.score}/100
                      </span>
                      <span className="flex-1 text-[11px] text-[var(--text-tertiary)] truncate" title={check.details || check.label}>
                        {getCheckLabel(check.key, check.label)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedCheckKey((prev) => (prev === check.key ? null : check.key))}
                        className="p-1 rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)]"
                        title="查看评分依据"
                      >
                        <CircleHelp className="w-3 h-3" />
                      </button>
                    </div>
                    {expandedCheckKey === check.key && (
                      <div className="ml-16 rounded border border-[var(--border-primary)] bg-[var(--bg-base)]/60 px-2 py-1.5 text-[10px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
                        {check.details || '暂无评分依据。'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {expandedSection === 'quality' && !quality && (
            <div className="px-4 pb-4 border-t border-[var(--border-primary)]">
              <p className="pt-3 text-xs text-[var(--text-muted)]">当前镜头还没有质量评估结果。</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">流程进度</p>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {completedSteps}/{steps.length} 完成
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {steps.map((step) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setExpandedSection(step.key)}
                className={`px-2 py-1.5 rounded border text-[10px] text-left flex items-center gap-1.5 ${
                  expandedSection === step.key
                    ? 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                    : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {step.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                <span className="truncate">{step.label}</span>
              </button>
            ))}
          </div>
          {!isAdvancedMode && (
            <p className="text-[10px] text-[var(--text-muted)]">
              当前为新手模式。需要拆镜/九宫格时，可切换到顶部“高级”。
            </p>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] overflow-hidden">
          {renderSectionHeader('context', '资产上下文', '先确认场景、角色与道具绑定', steps[0]?.done)}
          {expandedSection === 'context' && (
            <div className="border-t border-[var(--border-primary)] p-3">
              {scriptData ? (
                <SceneContext
                  shot={shot}
                  scene={scene}
                  scenes={scriptData.scenes}
                  characters={activeCharacters}
                  availableCharacters={availableCharacters}
                  props={activeProps}
                  availableProps={availablePropsForShot}
                  onAddCharacter={onAddCharacter}
                  onRemoveCharacter={onRemoveCharacter}
                  onVariationChange={onVariationChange}
                  onSceneChange={onSceneChange}
                  onAddProp={onAddProp}
                  onRemoveProp={onRemoveProp}
                />
              ) : (
                <p className="text-xs text-[var(--text-muted)]">暂无脚本资产数据。</p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] overflow-hidden">
          {renderSectionHeader('keyframe', '关键帧制作', '完成首帧/尾帧后再进入视频', steps[1]?.done)}
          {expandedSection === 'keyframe' && (
            <div className="border-t border-[var(--border-primary)] p-3">
              <KeyframeEditor
                startKeyframe={startKf}
                endKeyframe={endKf}
                showEndFrame={showEndFrame}
                canCopyPrevious={shotIndex > 0}
                canCopyNext={shotIndex < totalShots - 1 && nextShotHasStartFrame}
                isAIOptimizing={isAIOptimizing}
                useAIEnhancement={useAIEnhancement}
                onToggleAIEnhancement={onToggleAIEnhancement}
                onGenerateKeyframe={onGenerateKeyframe}
                onUploadKeyframe={onUploadKeyframe}
                onEditPrompt={onEditKeyframePrompt}
                onOptimizeWithAI={onOptimizeKeyframeWithAI}
                onOptimizeBothWithAI={onOptimizeBothKeyframes}
                onCopyPrevious={onCopyPreviousEndFrame}
                onCopyNext={onCopyNextStartFrame}
                onImageClick={onImageClick}
              />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] overflow-hidden">
          {renderSectionHeader('narrative', '动作与台词', '保持叙事动作清晰并可执行', steps[2]?.done)}
          {expandedSection === 'narrative' && (
            <div className="border-t border-[var(--border-primary)] p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-[var(--border-primary)] pb-2">
                <Film className="w-4 h-4 text-[var(--text-tertiary)]" />
                <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Narrative</h4>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={onGenerateAIAction}
                    disabled={isAIOptimizing}
                    className="p-1 text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="AI生成动作建议"
                  >
                    {isAIOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={onEditActionSummary}
                    className="p-1 text-[var(--warning-text)] hover:text-[var(--text-primary)] transition-colors"
                    title="编辑动作文本"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar">
                <div className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-primary)]">
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{shot.actionSummary || '暂无动作描述。'}</p>
                </div>
                {shot.dialogue && (
                  <div className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-primary)] flex gap-3">
                    <MessageSquare className="w-4 h-4 text-[var(--text-muted)] mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[var(--text-tertiary)] text-xs italic leading-relaxed">"{shot.dialogue}"</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] overflow-hidden">
          {renderSectionHeader('video', '视频生成', '选模型、设参数、出片', steps[3]?.done)}
          {expandedSection === 'video' && (
            <div className="border-t border-[var(--border-primary)] p-3">
              <VideoGenerator
                shot={shot}
                hasStartFrame={hasStartFrame}
                hasEndFrame={hasEndFrame}
                onGenerate={onGenerateVideo}
                onEditPrompt={onEditVideoPrompt}
                onModelChange={(modelId) => {
                  setLocalVideoModelId(modelId);
                  onVideoModelChange(modelId);
                }}
              />
            </div>
          )}
        </section>

        {isAdvancedMode && (
          <section className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] overflow-hidden">
            {renderSectionHeader('advanced', '高级工具', '拆镜与九宫格 storyboard', undefined)}
            {expandedSection === 'advanced' && (
              <div className="border-t border-[var(--border-primary)] p-4 space-y-3">
                <button
                  onClick={onSplitShot}
                  disabled={isSplittingShot}
                  className="w-full py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSplittingShot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
                  {isSplittingShot ? '拆镜中...' : 'AI拆分镜头'}
                </button>

                {localVideoModelId !== 'veo' && (
                  <div className="space-y-2">
                    <button
                      onClick={
                        nineGrid?.status === 'completed' || nineGrid?.status === 'panels_ready' || nineGrid?.status === 'generating_image'
                          ? onShowNineGrid
                          : onGenerateNineGrid
                      }
                      disabled={nineGrid?.status === 'generating_panels' || nineGrid?.status === 'generating_image'}
                      className={`w-full py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 border ${
                        nineGrid?.status === 'generating_panels' || nineGrid?.status === 'generating_image'
                          ? 'bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-primary)] cursor-wait'
                          : nineGrid?.status === 'completed'
                            ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
                            : nineGrid?.status === 'panels_ready'
                              ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]'
                              : 'bg-[var(--bg-base)] text-[var(--text-tertiary)] border-[var(--border-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {nineGrid?.status === 'generating_panels' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>分镜描述生成中...</span>
                        </>
                      ) : nineGrid?.status === 'generating_image' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>九宫格出图中...</span>
                        </>
                      ) : nineGrid?.status === 'completed' ? (
                        <>
                          <Grid3x3 className="w-3.5 h-3.5" />
                          <span>查看九宫格分镜</span>
                        </>
                      ) : nineGrid?.status === 'panels_ready' ? (
                        <>
                          <Grid3x3 className="w-3.5 h-3.5" />
                          <span>确认九宫格分镜</span>
                        </>
                      ) : (
                        <>
                          <Grid3x3 className="w-3.5 h-3.5" />
                          <span>生成九宫格分镜</span>
                        </>
                      )}
                    </button>

                    {nineGrid?.status === 'completed' && nineGrid.imageUrl && (
                      <div
                        className="relative bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden cursor-pointer group"
                        onClick={onShowNineGrid}
                      >
                        <img
                          src={nineGrid.imageUrl}
                          className="w-full h-auto block transition-transform duration-300 group-hover:scale-105"
                          alt="九宫格分镜预览"
                        />
                        <div className="absolute inset-0 bg-[var(--bg-base)]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="text-[var(--text-primary)] text-xs font-mono">点击查看并选择镜头</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="border-t border-[var(--border-primary)] bg-[var(--bg-surface)] p-4 space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{primaryAction.hint}</span>
        </div>
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          className="w-full py-2.5 rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {primaryAction.label}
        </button>
      </div>
    </div>
  );
};

export default ShotWorkbench;

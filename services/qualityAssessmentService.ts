import { ScriptData, Shot, ShotQualityAssessment, QualityCheck } from '../types';

const QUALITY_SCHEMA_VERSION = 1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resolveSupportsEndFrame = (modelId?: string): boolean => {
  const id = (modelId || '').toLowerCase();
  if (!id) return false;
  if (id.startsWith('sora') || id.startsWith('doubao-seedance')) return false;
  return true;
};

const pickCheck = (
  key: string,
  label: string,
  score: number,
  weight: number,
  details?: string
): QualityCheck => ({
  key,
  label,
  score: clamp(Math.round(score), 0, 100),
  weight,
  passed: score >= 70,
  details,
});

const evaluatePromptReadiness = (shot: Shot): QualityCheck => {
  const startPrompt = shot.keyframes?.find((frame) => frame.type === 'start')?.visualPrompt?.trim() || '';
  const endPrompt = shot.keyframes?.find((frame) => frame.type === 'end')?.visualPrompt?.trim() || '';
  const videoPrompt = shot.interval?.videoPrompt?.trim() || '';

  let score = 0;
  if (startPrompt.length >= 40) score += 45;
  else if (startPrompt.length >= 16) score += 30;
  else if (startPrompt.length > 0) score += 15;

  if (endPrompt.length >= 30) score += 25;
  else if (endPrompt.length > 0) score += 10;

  if (videoPrompt.length >= 30) score += 20;
  else if (videoPrompt.length > 0) score += 10;

  if (shot.actionSummary.trim().length >= 12) score += 10;

  return pickCheck(
    'prompt-readiness',
    'Prompt Readiness',
    score,
    30,
    'Checks start/end keyframe prompts and video prompt completeness.'
  );
};

const evaluateAssetCoverage = (shot: Shot, scriptData?: ScriptData | null): QualityCheck => {
  if (!scriptData) {
    return pickCheck(
      'asset-coverage',
      'Asset Coverage',
      35,
      20,
      'Script data not available; cannot verify scene/character references.'
    );
  }

  const scene = scriptData.scenes.find((entry) => String(entry.id) === String(shot.sceneId));
  const sceneScore = scene?.referenceImage ? 35 : 10;

  const charIds = shot.characters || [];
  const charScoreParts = charIds.map((charId) => {
    const char = scriptData.characters.find((entry) => String(entry.id) === String(charId));
    if (!char) return 0;
    const variationId = shot.characterVariations?.[charId];
    if (variationId) {
      const variation = char.variations?.find((entry) => entry.id === variationId);
      if (variation?.referenceImage) return 25;
    }
    if (char.referenceImage) return 25;
    return 5;
  });
  const characterScore = charScoreParts.length
    ? charScoreParts.reduce((sum, value) => sum + value, 0) / charScoreParts.length
    : 20;

  const props = shot.props || [];
  const propScoreParts = props.map((propId) => {
    const prop = scriptData.props?.find((entry) => String(entry.id) === String(propId));
    if (!prop) return 0;
    return prop.referenceImage ? 10 : 4;
  });
  const propScore = propScoreParts.length
    ? propScoreParts.reduce((sum, value) => sum + value, 0) / propScoreParts.length
    : 10;

  return pickCheck(
    'asset-coverage',
    'Asset Coverage',
    sceneScore + characterScore + propScore,
    20,
    'Checks linked scene/character/prop references for consistency constraints.'
  );
};

const evaluateKeyframeExecution = (shot: Shot): QualityCheck => {
  const startFrame = shot.keyframes?.find((frame) => frame.type === 'start');
  const endFrame = shot.keyframes?.find((frame) => frame.type === 'end');
  const supportsEndFrame = resolveSupportsEndFrame(shot.videoModel);

  let score = 0;
  if (startFrame?.imageUrl) score += 55;
  else if (startFrame?.status === 'generating') score += 25;
  else if (startFrame?.visualPrompt) score += 15;

  if (supportsEndFrame) {
    if (endFrame?.imageUrl) score += 35;
    else if (endFrame?.status === 'generating') score += 15;
    else if (endFrame?.visualPrompt) score += 10;
  } else {
    score += 30;
  }

  if (startFrame?.status === 'failed' || endFrame?.status === 'failed') {
    score -= 20;
  }

  return pickCheck(
    'keyframe-execution',
    'Keyframe Execution',
    score,
    30,
    supportsEndFrame
      ? 'Start/end frame availability and status for interpolation models.'
      : 'Start-frame quality for start-frame-driven models.'
  );
};

const evaluateVideoExecution = (shot: Shot): QualityCheck => {
  const interval = shot.interval;
  if (!interval) {
    return pickCheck(
      'video-execution',
      'Video Execution',
      30,
      20,
      'Video has not been generated yet.'
    );
  }

  let score = 0;
  if (interval.videoUrl && interval.status === 'completed') score = 100;
  else if (interval.status === 'generating') score = 55;
  else if (interval.status === 'pending') score = 35;
  else if (interval.status === 'failed') score = 10;

  return pickCheck(
    'video-execution',
    'Video Execution',
    score,
    20,
    'Checks video generation completion status.'
  );
};

const evaluateContinuity = (shot: Shot): QualityCheck => {
  const startFrame = shot.keyframes?.find((frame) => frame.type === 'start');
  const endFrame = shot.keyframes?.find((frame) => frame.type === 'end');
  const supportsEndFrame = resolveSupportsEndFrame(shot.videoModel);
  const hasCharacters = (shot.characters?.length || 0) > 0;

  let score = 40;
  if (startFrame?.imageUrl) score += 25;
  if (supportsEndFrame && endFrame?.imageUrl) score += 25;
  if (!supportsEndFrame) score += 20;

  if (hasCharacters && !startFrame?.imageUrl) score -= 20;
  if (supportsEndFrame && hasCharacters && !endFrame?.imageUrl) score -= 10;

  return pickCheck(
    'continuity-risk',
    'Continuity Risk',
    score,
    10,
    'Estimates continuity robustness based on frame anchors and model capability.'
  );
};

const weightedScore = (checks: QualityCheck[]): number => {
  const weightedSum = checks.reduce((sum, check) => sum + check.score * check.weight, 0);
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
  return Math.round(weightedSum / totalWeight);
};

const resolveGrade = (score: number): ShotQualityAssessment['grade'] => {
  if (score >= 80) return 'pass';
  if (score >= 60) return 'warning';
  return 'fail';
};

const buildSummary = (checks: QualityCheck[], grade: ShotQualityAssessment['grade']): string => {
  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.label);
  if (!failedChecks.length) {
    return 'Ready for production. Core checks passed.';
  }

  const prefix =
    grade === 'fail'
      ? 'High risk:'
      : grade === 'warning'
        ? 'Needs refinement:'
        : 'Minor issues:';
  return `${prefix} ${failedChecks.join(', ')}`;
};

export const assessShotQuality = (
  shot: Shot,
  scriptData?: ScriptData | null
): ShotQualityAssessment => {
  const checks: QualityCheck[] = [
    evaluatePromptReadiness(shot),
    evaluateAssetCoverage(shot, scriptData),
    evaluateKeyframeExecution(shot),
    evaluateVideoExecution(shot),
    evaluateContinuity(shot),
  ];

  const score = weightedScore(checks);
  const grade = resolveGrade(score);

  return {
    version: QUALITY_SCHEMA_VERSION,
    score,
    grade,
    generatedAt: Date.now(),
    checks,
    summary: buildSummary(checks, grade),
  };
};

export const getProjectAverageQualityScore = (shots: Shot[]): number => {
  const assessments = shots
    .map((shot) => shot.qualityAssessment)
    .filter((assessment): assessment is ShotQualityAssessment => !!assessment);

  if (!assessments.length) return 0;
  const sum = assessments.reduce((acc, assessment) => acc + assessment.score, 0);
  return Math.round(sum / assessments.length);
};


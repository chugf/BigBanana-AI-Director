/**
 * 剧本处理服务
 * 包含剧本解析、分镜生成、续写、改写等功能
 */

import { ScriptData, Shot, Scene, Character, Prop, ArtDirection, QualityCheck, ShotQualityAssessment } from "../../types";
import { addRenderLogWithTokens } from '../renderLogService';
import { parseDurationToSeconds } from '../durationParser';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  chatCompletionStream,
  getActiveVideoModel,
  logScriptProgress,
} from './apiCore';
import { getStylePrompt } from './promptConstants';
import { generateArtDirection, generateAllCharacterPrompts, generateVisualPrompts } from './visualService';

// Re-export 日志回调函数（保持外部 API 兼容）
export { setScriptLogCallback, clearScriptLogCallback, logScriptProgress } from './apiCore';

// ============================================
// 剧本解析
// ============================================

/**
 * Agent 1: Script Structuring
 * 解析原始文本为结构化剧本数据（不包含视觉提示词生成）
 */
export const parseScriptStructure = async (
  rawText: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  abortSignal?: AbortSignal
): Promise<ScriptData> => {
  const wait = async (ms: number) =>
    new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | null = null;
      const timer = setTimeout(() => {
        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);
      if (abortSignal) {
        onAbort = () => {
          clearTimeout(timer);
          abortSignal.removeEventListener('abort', onAbort);
          reject(new Error('请求已取消'));
        };
        abortSignal.addEventListener('abort', onAbort);
      }
    });

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw new Error('请求已取消');
    }
  };

  const normalizePropCategory = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '其他';
    const dictionary = ['武器', '文件/书信', '食物/饮品', '交通工具', '装饰品', '科技设备', '其他'];
    if (dictionary.includes(raw)) return raw;
    const normalized = raw.toLowerCase();
    if (normalized.includes('weapon') || normalized.includes('武')) return '武器';
    if (normalized.includes('document') || normalized.includes('letter') || normalized.includes('文件') || normalized.includes('书信')) return '文件/书信';
    if (normalized.includes('food') || normalized.includes('drink') || normalized.includes('食') || normalized.includes('饮')) return '食物/饮品';
    if (normalized.includes('vehicle') || normalized.includes('car') || normalized.includes('车') || normalized.includes('交通')) return '交通工具';
    if (normalized.includes('decor') || normalized.includes('ornament') || normalized.includes('装饰')) return '装饰品';
    if (normalized.includes('tech') || normalized.includes('device') || normalized.includes('科技') || normalized.includes('设备')) return '科技设备';
    return '其他';
  };

  const normalizeStructure = (parsed: any): ScriptData => {
    const characters: Character[] = Array.isArray(parsed.characters)
      ? parsed.characters.map((c: any, idx: number) => ({
          id: String(c?.id ?? `char-${idx + 1}`),
          name: String(c?.name || `角色${idx + 1}`),
          gender: String(c?.gender || ''),
          age: String(c?.age || ''),
          personality: String(c?.personality || ''),
          visualPrompt: c?.visualPrompt ? String(c.visualPrompt) : undefined,
          negativePrompt: c?.negativePrompt ? String(c.negativePrompt) : undefined,
          variations: []
        }))
      : [];

    const scenes: Scene[] = Array.isArray(parsed.scenes)
      ? parsed.scenes.map((s: any, idx: number) => ({
          id: String(s?.id ?? `scene-${idx + 1}`),
          location: String(s?.location || `场景${idx + 1}`),
          time: String(s?.time || ''),
          atmosphere: String(s?.atmosphere || ''),
          visualPrompt: s?.visualPrompt ? String(s.visualPrompt) : undefined,
          negativePrompt: s?.negativePrompt ? String(s.negativePrompt) : undefined
        }))
      : [];

    const props: Prop[] = Array.isArray(parsed.props)
      ? parsed.props.map((p: any, idx: number) => ({
          id: String(p?.id ?? `prop-${idx + 1}`),
          name: String(p?.name || `道具${idx + 1}`),
          category: normalizePropCategory(String(p?.category || '其他')),
          description: String(p?.description || ''),
          visualPrompt: p?.visualPrompt ? String(p.visualPrompt) : undefined,
          negativePrompt: p?.negativePrompt ? String(p.negativePrompt) : undefined,
          status: 'pending'
        }))
      : [];

    const validSceneIds = new Set(scenes.map(scene => String(scene.id)));
    const firstSceneId = scenes[0]?.id || 'scene-1';

    const normalizeSceneRefId = (value: any, paragraphIndex: number): string => {
      const raw = String(value ?? '').trim();
      if (raw && validSceneIds.has(raw)) return raw;

      const asNumber = Number(raw);
      if (Number.isFinite(asNumber) && scenes.length > 0) {
        const idx = Math.min(Math.max(Math.floor(asNumber) - 1, 0), scenes.length - 1);
        return scenes[idx].id;
      }

      if (scenes.length > 0) {
        return scenes[Math.min(paragraphIndex, scenes.length - 1)].id;
      }
      return firstSceneId;
    };

    const storyParagraphsRaw = Array.isArray(parsed.storyParagraphs) ? parsed.storyParagraphs : [];
    const storyParagraphs = storyParagraphsRaw.length > 0
      ? storyParagraphsRaw.map((p: any, idx: number) => ({
          id: Number.isFinite(Number(p?.id)) ? Number(p.id) : idx + 1,
          text: String(p?.text || '').trim(),
          sceneRefId: normalizeSceneRefId(p?.sceneRefId, idx)
        })).filter((p: any) => p.text.length > 0)
      : [];

    return {
      title: String(parsed.title || '未命名剧本'),
      genre: String(parsed.genre || '通用'),
      logline: String(parsed.logline || ''),
      language,
      characters,
      scenes,
      props,
      storyParagraphs
    };
  };

  console.log('📝 parseScriptStructure 调用 - 使用模型:', model);
  logScriptProgress('正在解析剧本结构...');

  const prompt = `
    Analyze the text and output a JSON object in the language: ${language}.
    
    Tasks:
    1. Extract title, genre, logline (in ${language}).
    2. Extract characters (id, name, gender, age, personality).
    3. Extract scenes (id, location, time, atmosphere).
    4. Extract recurring props/items that appear in multiple scenes (id, name, category, description).
    5. Break down the story into paragraphs linked to scenes.
    
    Input:
    "${rawText.slice(0, 30000)}" // Limit input context if needed
    
    Output ONLY valid JSON with this structure:
    {
      "title": "string",
      "genre": "string",
      "logline": "string",
      "characters": [{"id": "string", "name": "string", "gender": "string", "age": "string", "personality": "string"}],
      "scenes": [{"id": "string", "location": "string", "time": "string", "atmosphere": "string"}],
      "props": [{"id":"string","name":"string","category":"string","description":"string"}],
      "storyParagraphs": [{"id": number, "text": "string", "sceneRefId": "string"}]
    }
  `;

  ensureNotAborted();
  const responseText = await retryOperation(
    () => chatCompletion(prompt, model, 0.7, 8192, 'json_object', 600000, abortSignal),
    3,
    2000,
    abortSignal
  );
  ensureNotAborted();

  let parsed: any = {};
  try {
    const text = cleanJsonString(responseText);
    parsed = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse script structure JSON:", e);
    parsed = {};
  }

  const structured = normalizeStructure(parsed);

  if (structured.storyParagraphs.length === 0 && structured.scenes.length > 0) {
    const fallbackParagraphs = rawText
      .split(/\n{2,}|\r\n{2,}/g)
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 12);

    structured.storyParagraphs = fallbackParagraphs.map((text, idx) => ({
      id: idx + 1,
      text,
      sceneRefId: structured.scenes[Math.min(idx, structured.scenes.length - 1)].id
    }));
  }

  ensureNotAborted();
  await wait(1);
  return structured;
};

/**
 * Agent 2: Visual Prompt Enrichment
 * 基于结构化剧本生成美术指导、角色/场景/道具视觉提示词
 */
export const enrichScriptDataVisuals = async (
  scriptData: ScriptData,
  model: string = 'gpt-5.1',
  visualStyle: string = '3d-animation',
  language: string = '中文',
  options?: {
    onlyMissing?: boolean;
    abortSignal?: AbortSignal;
  }
): Promise<ScriptData> => {
  const onlyMissing = options?.onlyMissing ?? false;
  const abortSignal = options?.abortSignal;

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw new Error('请求已取消');
    }
  };

  const wait = async (ms: number) =>
    new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | null = null;
      const timer = setTimeout(() => {
        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);
      if (abortSignal) {
        onAbort = () => {
          clearTimeout(timer);
          abortSignal.removeEventListener('abort', onAbort);
          reject(new Error('请求已取消'));
        };
        abortSignal.addEventListener('abort', onAbort);
      }
    });

  const cloneScriptData = (source: ScriptData): ScriptData => {
    if (typeof structuredClone === 'function') {
      return structuredClone(source);
    }
    return JSON.parse(JSON.stringify(source)) as ScriptData;
  };

  const nextData = cloneScriptData(scriptData);
  nextData.language = language || nextData.language || '中文';
  nextData.visualStyle = visualStyle || nextData.visualStyle || '3d-animation';

  const genre = nextData.genre || "通用";
  const characters = nextData.characters || [];
  const scenes = nextData.scenes || [];
  const props = nextData.props || [];

  console.log("🎨 正在为角色、场景和道具生成视觉提示词...", `风格: ${nextData.visualStyle}`);
  logScriptProgress(`正在生成角色/场景/道具视觉提示词（风格：${nextData.visualStyle}）...`);

  ensureNotAborted();
  let artDirection: ArtDirection | undefined = nextData.artDirection;
  if (!artDirection) {
    try {
      artDirection = await generateArtDirection(
        nextData.title || '未命名剧本',
        genre,
        nextData.logline || '',
        characters.map(c => ({ name: c.name, gender: c.gender, age: c.age, personality: c.personality })),
        scenes.map(s => ({ location: s.location, time: s.time, atmosphere: s.atmosphere })),
        nextData.visualStyle || '3d-animation',
        nextData.language || language,
        model,
        abortSignal
      );
      nextData.artDirection = artDirection;
      console.log("✅ 全局美术指导文档生成完成，风格关键词:", artDirection.moodKeywords.join(', '));
    } catch (e) {
      console.error("⚠️ 全局美术指导文档生成失败，将使用默认风格:", e);
    }
  }

  ensureNotAborted();
  const missingCharacterIndexes = characters
    .map((char, idx) => ({ idx, missing: !char.visualPrompt }))
    .filter(entry => (onlyMissing ? entry.missing : true))
    .map(entry => entry.idx);

  const shouldBatchGenerateCharacters =
    missingCharacterIndexes.length > 0 &&
    !onlyMissing &&
    !!artDirection;

  if (shouldBatchGenerateCharacters) {
    try {
      await wait(1200);
      const batchResults = await generateAllCharacterPrompts(
        characters,
        artDirection!,
        genre,
        nextData.visualStyle || '3d-animation',
        nextData.language || language,
        model,
        abortSignal
      );

      for (let i = 0; i < characters.length; i++) {
        if (batchResults[i]?.visualPrompt) {
          characters[i].visualPrompt = batchResults[i].visualPrompt;
          characters[i].negativePrompt = batchResults[i].negativePrompt;
        }
      }
    } catch (e) {
      console.error("批量角色提示词生成失败，回退到逐个生成模式:", e);
    }
  }

  for (const idx of missingCharacterIndexes) {
    ensureNotAborted();
    if (characters[idx].visualPrompt) continue;
    try {
      if (idx > 0) await wait(1200);
      console.log(`  生成角色提示词: ${characters[idx].name}`);
      logScriptProgress(`生成角色视觉提示词：${characters[idx].name}`);
      const prompts = await generateVisualPrompts(
        'character',
        characters[idx],
        genre,
        model,
        nextData.visualStyle || '3d-animation',
        nextData.language || language,
        artDirection,
        abortSignal
      );
      characters[idx].visualPrompt = prompts.visualPrompt;
      characters[idx].negativePrompt = prompts.negativePrompt;
    } catch (e) {
      console.error(`Failed to generate visual prompt for character ${characters[idx].name}:`, e);
    }
  }

  const sceneIndexes = scenes
    .map((scene, idx) => ({ idx, missing: !scene.visualPrompt }))
    .filter(entry => (onlyMissing ? entry.missing : true))
    .map(entry => entry.idx);

  for (const idx of sceneIndexes) {
    ensureNotAborted();
    try {
      await wait(1200);
      console.log(`  生成场景提示词: ${scenes[idx].location}`);
      logScriptProgress(`生成场景视觉提示词：${scenes[idx].location}`);
      const prompts = await generateVisualPrompts(
        'scene',
        scenes[idx],
        genre,
        model,
        nextData.visualStyle || '3d-animation',
        nextData.language || language,
        artDirection,
        abortSignal
      );
      scenes[idx].visualPrompt = prompts.visualPrompt;
      scenes[idx].negativePrompt = prompts.negativePrompt;
    } catch (e) {
      console.error(`Failed to generate visual prompt for scene ${scenes[idx].location}:`, e);
    }
  }

  const propIndexes = props
    .map((prop, idx) => ({ idx, missing: !prop.visualPrompt }))
    .filter(entry => (onlyMissing ? entry.missing : true))
    .map(entry => entry.idx);

  for (const idx of propIndexes) {
    ensureNotAborted();
    try {
      await wait(1000);
      console.log(`  生成道具提示词: ${props[idx].name}`);
      logScriptProgress(`生成道具视觉提示词：${props[idx].name}`);
      const prompts = await generateVisualPrompts(
        'prop',
        props[idx],
        genre,
        model,
        nextData.visualStyle || '3d-animation',
        nextData.language || language,
        artDirection,
        abortSignal
      );
      props[idx].visualPrompt = prompts.visualPrompt;
      props[idx].negativePrompt = prompts.negativePrompt;
    } catch (e) {
      console.error(`Failed to generate visual prompt for prop ${props[idx].name}:`, e);
    }
  }

  console.log("✅ 视觉提示词生成完成！");
  logScriptProgress('视觉提示词生成完成');
  return nextData;
};

/**
 * Agent 1 & 2: Script Structuring & Breakdown
 * 解析原始文本并完成视觉提示词增强
 */
export const parseScriptToData = async (
  rawText: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  visualStyle: string = '3d-animation'
): Promise<ScriptData> => {
  console.log('📝 parseScriptToData 调用 - 使用模型:', model, '视觉风格:', visualStyle);
  const startTime = Date.now();

  try {
    const structured = await parseScriptStructure(rawText, language, model);
    const enriched = await enrichScriptDataVisuals(structured, model, visualStyle, language);

    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'script-parse-' + Date.now(),
      resourceName: enriched.title || '剧本解析',
      status: 'success',
      model: model,
      prompt: rawText.substring(0, 200) + '...',
      duration: Date.now() - startTime
    });

    return enriched;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'script-parse-' + Date.now(),
      resourceName: '剧本解析',
      status: 'failed',
      model: model,
      prompt: rawText.substring(0, 200) + '...',
      error: error.message,
      duration: Date.now() - startTime
    });
    throw error;
  }
};

// ============================================
// 分镜生成
// ============================================

interface GenerateShotListOptions {
  abortSignal?: AbortSignal;
  previousScriptData?: ScriptData | null;
  previousShots?: Shot[];
  reuseUnchangedScenes?: boolean;
  enableQualityCheck?: boolean;
}

// Keep version=1 so StageDirector does not mislabel this deterministic pass as AI V2 scoring.
const SCRIPT_STAGE_QUALITY_SCHEMA_VERSION = 1;

const isAbortSignalLike = (value: unknown): value is AbortSignal => {
  return !!value && typeof value === 'object' && 'aborted' in (value as Record<string, unknown>);
};

const clampScore = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, Math.round(value)));
};

const normalizeMatchText = (value: string): string => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const hashText = (value: string): string => {
  const raw = String(value || '');
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return `${(hash >>> 0).toString(16)}-${raw.length}`;
};

const buildSceneReuseSignature = (input: {
  scene: Scene;
  actionText: string;
  shotsPerScene: number;
  visualStyle: string;
  language: string;
  model: string;
  artDirectionSeed?: string;
}): string => {
  const normalizedScene = [
    normalizeMatchText(input.scene.location),
    normalizeMatchText(input.scene.time),
    normalizeMatchText(input.scene.atmosphere),
  ].join('|');
  const normalizedAction = normalizeMatchText(input.actionText).slice(0, 1200);
  const payload = [
    normalizedScene,
    hashText(normalizedAction),
    input.shotsPerScene,
    normalizeMatchText(input.visualStyle),
    normalizeMatchText(input.language),
    normalizeMatchText(input.model),
    hashText(normalizeMatchText(input.artDirectionSeed || '')),
  ].join('::');
  return `scene-${hashText(payload)}`;
};

const buildAssetIdRemap = <T extends { id: string; name: string }>(
  fromItems: T[] = [],
  toItems: T[] = []
): Map<string, string> => {
  const result = new Map<string, string>();
  const toIdSet = new Set(toItems.map(item => String(item.id)));
  const toByName = new Map<string, string>();
  for (const item of toItems) {
    const key = normalizeMatchText(item.name);
    if (key && !toByName.has(key)) {
      toByName.set(key, String(item.id));
    }
  }

  for (const item of fromItems) {
    const fromId = String(item.id);
    if (toIdSet.has(fromId)) {
      result.set(fromId, fromId);
      continue;
    }
    const mappedByName = toByName.get(normalizeMatchText(item.name));
    if (mappedByName) {
      result.set(fromId, mappedByName);
    }
  }
  return result;
};

const remapIds = (
  ids: unknown,
  idRemap: Map<string, string>,
  validIds: Set<string>
): string[] => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const sourceId = String(raw);
    const mapped = idRemap.get(sourceId) || sourceId;
    if (!validIds.has(mapped) || seen.has(mapped)) continue;
    seen.add(mapped);
    result.push(mapped);
  }
  return result;
};

const pickQualityCheck = (
  key: string,
  label: string,
  score: number,
  weight: number,
  details: string
): QualityCheck => ({
  key,
  label,
  score: clampScore(score, 0, 100),
  weight,
  passed: score >= 70,
  details
});

const getWeightedScore = (checks: QualityCheck[]): number => {
  const weightedSum = checks.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = checks.reduce((sum, item) => sum + item.weight, 0) || 1;
  return clampScore(weightedSum / totalWeight, 0, 100);
};

const getGrade = (score: number): ShotQualityAssessment['grade'] => {
  if (score >= 80) return 'pass';
  if (score >= 60) return 'warning';
  return 'fail';
};

const normalizeShotKeyframes = (
  shot: Shot,
  shotIndex: number,
  visualStyle: string
): Shot['keyframes'] => {
  const keyframes = Array.isArray(shot.keyframes) ? shot.keyframes : [];
  const startFrame = keyframes.find(frame => frame?.type === 'start');
  const endFrame = keyframes.find(frame => frame?.type === 'end');
  const action = String(shot.actionSummary || '镜头').trim() || '镜头';

  const startPrompt = String(startFrame?.visualPrompt || '').trim() || `${action}，起始状态，${visualStyle}风格`;
  const endPrompt = String(endFrame?.visualPrompt || '').trim() || `${action}，结束状态，${visualStyle}风格`;

  return [
    {
      ...(startFrame || {}),
      id: String(startFrame?.id || `kf-${shotIndex + 1}-start`),
      type: 'start',
      visualPrompt: startPrompt,
      status: startFrame?.status || 'pending'
    },
    {
      ...(endFrame || {}),
      id: String(endFrame?.id || `kf-${shotIndex + 1}-end`),
      type: 'end',
      visualPrompt: endPrompt,
      status: endFrame?.status || 'pending'
    }
  ];
};

const assessScriptStageShotQuality = (input: {
  shot: Shot;
  previousShotInScene?: Shot;
  validCharacterIds: Set<string>;
  validPropIds: Set<string>;
  visualStyle: string;
}): ShotQualityAssessment => {
  const { shot, previousShotInScene, validCharacterIds, validPropIds, visualStyle } = input;
  const startFrame = shot.keyframes.find(frame => frame.type === 'start');
  const endFrame = shot.keyframes.find(frame => frame.type === 'end');
  const normalizedAction = normalizeMatchText(shot.actionSummary || '');
  const normalizedPrevAction = normalizeMatchText(previousShotInScene?.actionSummary || '');

  const actionScore = normalizedAction.length >= 6 ? 45 : normalizedAction.length > 0 ? 20 : 0;
  const cameraScore = String(shot.cameraMovement || '').trim() ? 30 : 0;
  const shotSizeScore = String(shot.shotSize || '').trim() ? 25 : 0;
  const requiredFieldsScore = actionScore + cameraScore + shotSizeScore;
  const requiredFieldsCheck = pickQualityCheck(
    'required-fields',
    'Required Fields',
    requiredFieldsScore,
    30,
    [
      '规则：actionSummary 45分 + cameraMovement 30分 + shotSize 25分',
      `actionSummary: ${normalizedAction ? '已填写' : '缺失'}`,
      `cameraMovement: ${String(shot.cameraMovement || '').trim() ? '已填写' : '缺失'}`,
      `shotSize: ${String(shot.shotSize || '').trim() ? '已填写' : '缺失'}`,
    ].join('\n')
  );

  const hasStart = !!startFrame;
  const hasEnd = !!endFrame;
  const startPromptLength = String(startFrame?.visualPrompt || '').trim().length;
  const endPromptLength = String(endFrame?.visualPrompt || '').trim().length;
  const keyframeScore =
    (hasStart ? 30 : 0) +
    (hasEnd ? 30 : 0) +
    (startPromptLength >= 14 ? 20 : startPromptLength > 0 ? 10 : 0) +
    (endPromptLength >= 14 ? 20 : endPromptLength > 0 ? 10 : 0);
  const keyframeCheck = pickQualityCheck(
    'keyframe-structure',
    'Keyframe Structure',
    keyframeScore,
    25,
    [
      '规则：首尾关键帧各30分 + 首尾提示词可用性各20分',
      `start frame: ${hasStart ? '存在' : '缺失'}，提示词长度=${startPromptLength}`,
      `end frame: ${hasEnd ? '存在' : '缺失'}，提示词长度=${endPromptLength}`,
    ].join('\n')
  );

  const invalidCharacterCount = (shot.characters || []).filter(id => !validCharacterIds.has(String(id))).length;
  const invalidPropCount = (shot.props || []).filter(id => !validPropIds.has(String(id))).length;
  const totalRefs = (shot.characters?.length || 0) + (shot.props?.length || 0);
  const referenceBase = totalRefs === 0 ? 82 : 100;
  const assetScore = Math.max(0, referenceBase - invalidCharacterCount * 45 - invalidPropCount * 30);
  const assetCheck = pickQualityCheck(
    'asset-reference',
    'Asset Reference',
    assetScore,
    20,
    [
      '规则：非法角色ID每个扣45分，非法道具ID每个扣30分；未绑定资产时按82分。',
      `角色引用：${shot.characters?.length || 0}，非法=${invalidCharacterCount}`,
      `道具引用：${shot.props?.length || 0}，非法=${invalidPropCount}`,
    ].join('\n')
  );

  let variationScore = 100;
  if (previousShotInScene) {
    if (normalizedAction && normalizedAction === normalizedPrevAction) variationScore -= 55;
    if (normalizeMatchText(shot.cameraMovement || '') === normalizeMatchText(previousShotInScene.cameraMovement || '')) {
      variationScore -= 20;
    }
    if (normalizeMatchText(shot.shotSize || '') === normalizeMatchText(previousShotInScene.shotSize || '')) {
      variationScore -= 20;
    }
  } else {
    variationScore = 88;
  }
  const variationCheck = pickQualityCheck(
    'scene-variation',
    'Scene Variation',
    variationScore,
    15,
    [
      '规则：同场景相邻镜头应避免动作摘要完全重复，并保持景别/运镜节奏变化。',
      previousShotInScene ? `上一镜头存在，比较后得分=${variationScore}` : '首镜头默认 88 分',
    ].join('\n')
  );

  const avgPromptLength = (startPromptLength + endPromptLength) / 2;
  let promptRichnessScore = 35;
  if (avgPromptLength >= 60) promptRichnessScore = 100;
  else if (avgPromptLength >= 35) promptRichnessScore = 82;
  else if (avgPromptLength >= 20) promptRichnessScore = 65;
  const combinedPromptText = `${startFrame?.visualPrompt || ''} ${endFrame?.visualPrompt || ''}`.toLowerCase();
  const styleHint = String(visualStyle || '').toLowerCase();
  if (styleHint && combinedPromptText.includes(styleHint)) {
    promptRichnessScore = Math.min(100, promptRichnessScore + 8);
  }
  const promptRichnessCheck = pickQualityCheck(
    'prompt-richness',
    'Prompt Richness',
    promptRichnessScore,
    10,
    [
      '规则：关键帧提示词越完整越高分，包含风格关键词可加分。',
      `start长度=${startPromptLength}，end长度=${endPromptLength}，均值=${Math.round(avgPromptLength)}`,
      styleHint ? `风格关键词 "${styleHint}" ${combinedPromptText.includes(styleHint) ? '已出现' : '未出现'}` : '未提供风格关键词',
    ].join('\n')
  );

  const checks = [requiredFieldsCheck, keyframeCheck, assetCheck, variationCheck, promptRichnessCheck];
  const score = getWeightedScore(checks);
  const grade = getGrade(score);
  const failedLabels = checks.filter(item => !item.passed).map(item => item.label);
  const summary = failedLabels.length > 0
    ? `${grade === 'fail' ? '风险较高' : '建议优化'}：${failedLabels.join('、')}`
    : '结构与一致性检查通过。';

  return {
    version: SCRIPT_STAGE_QUALITY_SCHEMA_VERSION,
    score,
    grade,
    generatedAt: Date.now(),
    checks,
    summary
  };
};

const repairShotForScriptStage = (input: {
  shot: Shot;
  shotIndex: number;
  visualStyle: string;
  usedActionKeys: Set<string>;
  validCharacterIds: Set<string>;
  validPropIds: Set<string>;
  forcePromptRewrite?: boolean;
}): Shot => {
  const {
    shot,
    shotIndex,
    visualStyle,
    usedActionKeys,
    validCharacterIds,
    validPropIds,
    forcePromptRewrite = false
  } = input;
  const actionFallback = `镜头 ${shotIndex + 1} 推进`;
  let actionSummary = String(shot.actionSummary || '').trim() || actionFallback;
  const normalizedAction = normalizeMatchText(actionSummary);
  if (normalizedAction && usedActionKeys.has(normalizedAction)) {
    actionSummary = `${actionSummary}（镜头${shotIndex + 1}）`;
  }
  usedActionKeys.add(normalizeMatchText(actionSummary));

  const cameraMovement = String(shot.cameraMovement || '').trim() || 'Static Shot';
  const shotSize = String(shot.shotSize || '').trim() || 'Medium Shot';

  const characters = Array.from(
    new Set(
      (shot.characters || [])
        .map(id => String(id))
        .filter(id => validCharacterIds.has(id))
    )
  );
  const props = Array.from(
    new Set(
      (shot.props || [])
        .map(id => String(id))
        .filter(id => validPropIds.has(id))
    )
  );

  const keyframes = normalizeShotKeyframes({ ...shot, actionSummary }, shotIndex, visualStyle);
  if (forcePromptRewrite || String(keyframes[0]?.visualPrompt || '').trim().length < 12) {
    keyframes[0].visualPrompt = `${actionSummary}，起始构图，主体清晰，${visualStyle}风格，光影明确`;
  }
  if (forcePromptRewrite || String(keyframes[1]?.visualPrompt || '').trim().length < 12) {
    keyframes[1].visualPrompt = `${actionSummary}，结束构图，动作收束，${visualStyle}风格，镜头节奏完整`;
  }

  return {
    ...shot,
    actionSummary,
    cameraMovement,
    shotSize,
    characters,
    props,
    keyframes
  };
};

const applyScriptStageQualityPipeline = (
  shots: Shot[],
  scriptData: ScriptData,
  validCharacterIds: Set<string>,
  validPropIds: Set<string>,
  visualStyle: string
): Shot[] => {
  const previousByScene = new Map<string, Shot>();
  const usedActionKeysByScene = new Map<string, Set<string>>();
  const repairedShots = shots.map((shot, index) => {
    const sceneId = String(shot.sceneId || '');
    const usedActionKeys = usedActionKeysByScene.get(sceneId) || new Set<string>();
    if (!usedActionKeysByScene.has(sceneId)) {
      usedActionKeysByScene.set(sceneId, usedActionKeys);
    }

    let candidate = repairShotForScriptStage({
      shot,
      shotIndex: index,
      visualStyle,
      usedActionKeys,
      validCharacterIds,
      validPropIds,
      forcePromptRewrite: false
    });

    const previousShot = previousByScene.get(sceneId);
    let assessment = assessScriptStageShotQuality({
      shot: candidate,
      previousShotInScene: previousShot,
      validCharacterIds,
      validPropIds,
      visualStyle
    });

    const requiredFieldsPassed = assessment.checks.find(item => item.key === 'required-fields')?.passed;
    const keyframePassed = assessment.checks.find(item => item.key === 'keyframe-structure')?.passed;
    if (assessment.grade === 'fail' || !requiredFieldsPassed || !keyframePassed) {
      candidate = repairShotForScriptStage({
        shot: candidate,
        shotIndex: index,
        visualStyle,
        usedActionKeys,
        validCharacterIds,
        validPropIds,
        forcePromptRewrite: true
      });
      assessment = assessScriptStageShotQuality({
        shot: candidate,
        previousShotInScene: previousShot,
        validCharacterIds,
        validPropIds,
        visualStyle
      });
    }

    const withAssessment: Shot = {
      ...candidate,
      qualityAssessment: assessment
    };
    previousByScene.set(sceneId, withAssessment);
    return withAssessment;
  });

  const warnings = repairedShots.filter(shot => shot.qualityAssessment?.grade === 'warning').length;
  const fails = repairedShots.filter(shot => shot.qualityAssessment?.grade === 'fail').length;
  logScriptProgress(`分镜质量校验完成：${repairedShots.length}条（warning ${warnings}，fail ${fails}）`);

  return repairedShots;
};

/**
 * 生成分镜列表
 * 根据剧本数据和目标时长，为每个场景生成适量的分镜头
 */
export const generateShotList = async (
  scriptData: ScriptData,
  model: string = 'gpt-5.1',
  abortOrOptions?: AbortSignal | GenerateShotListOptions
): Promise<Shot[]> => {
  const options: GenerateShotListOptions = isAbortSignalLike(abortOrOptions)
    ? { abortSignal: abortOrOptions }
    : (abortOrOptions || {});
  const abortSignal = options.abortSignal;
  const previousScriptData = options.previousScriptData || null;
  const previousShots = Array.isArray(options.previousShots) ? options.previousShots : [];
  const enableQualityCheck = options.enableQualityCheck !== false;
  const shouldReuseUnchangedScenes =
    !!options.reuseUnchangedScenes &&
    !!previousScriptData &&
    previousShots.length > 0;

  console.log('🎬 generateShotList 调用 - 使用模型:', model, '视觉风格:', scriptData.visualStyle);
  logScriptProgress('正在生成分镜列表...');
  const overallStartTime = Date.now();

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw new Error('请求已取消');
    }
  };

  const wait = async (ms: number) =>
    new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | null = null;
      const timer = setTimeout(() => {
        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);
      if (abortSignal) {
        onAbort = () => {
          clearTimeout(timer);
          abortSignal.removeEventListener('abort', onAbort);
          reject(new Error('请求已取消'));
        };
        abortSignal.addEventListener('abort', onAbort);
      }
    });

  if (!scriptData.scenes || scriptData.scenes.length === 0) {
    return [];
  }

  const lang = scriptData.language || '中文';
  const visualStyle = scriptData.visualStyle || '3d-animation';
  const stylePrompt = getStylePrompt(visualStyle);
  const artDir = scriptData.artDirection;

  const targetDurationStr = scriptData.targetDuration || '60s';
  const targetSeconds = parseDurationToSeconds(targetDurationStr) || 60;
  const activeVideoModel = getActiveVideoModel();
  const requestedPlanningDuration = Number(scriptData.planningShotDuration);
  const shotDurationSeconds = Math.max(
    1,
    (Number.isFinite(requestedPlanningDuration) && requestedPlanningDuration > 0
      ? requestedPlanningDuration
      : Number(activeVideoModel?.params?.defaultDuration) || 8)
  );
  // Lock a planning baseline so later per-shot model changes do not silently drift count logic.
  scriptData.planningShotDuration = shotDurationSeconds;
  const roughShotCount = Math.max(1, Math.round(targetSeconds / shotDurationSeconds));
  const scenesCount = scriptData.scenes.length;
  const totalShotsNeeded = Math.max(roughShotCount, scenesCount);
  const baseShotsPerScene = Math.floor(totalShotsNeeded / scenesCount);
  const extraShots = totalShotsNeeded % scenesCount;
  const sceneShotPlan = scriptData.scenes.map((_, idx) => baseShotsPerScene + (idx < extraShots ? 1 : 0));

  const validCharacterIds = new Set((scriptData.characters || []).map(c => String(c.id)));
  const validPropIds = new Set((scriptData.props || []).map(p => String(p.id)));
  const characterIdRemap = buildAssetIdRemap(previousScriptData?.characters || [], scriptData.characters || []);
  const propIdRemap = buildAssetIdRemap(previousScriptData?.props || [], scriptData.props || []);

  const createSceneActionResolver = (data: ScriptData) => {
    const sceneIdOrder = data.scenes.map(scene => String(scene.id));
    const directParagraphMap = new Map<string, string[]>();
    (data.storyParagraphs || []).forEach(paragraph => {
      const key = String(paragraph.sceneRefId || '');
      if (!directParagraphMap.has(key)) {
        directParagraphMap.set(key, []);
      }
      const text = String(paragraph.text || '').trim();
      if (text) {
        directParagraphMap.get(key)!.push(text);
      }
    });

    const tokenizeForMatch = (value: string): string[] => {
      const normalized = String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
        .trim();
      if (!normalized) return [];
      const segments = normalized.split(/\s+/g).filter(Boolean);
      const tokens = new Set<string>(segments);
      for (const segment of segments) {
        if (/^[\u4e00-\u9fff]+$/u.test(segment) && segment.length > 1) {
          for (let i = 0; i < segment.length - 1; i += 1) {
            tokens.add(segment.slice(i, i + 2));
          }
        }
      }
      return Array.from(tokens);
    };

    const paragraphSceneScore = (paragraphText: string, scene: Scene): number => {
      const sceneQuery = `${scene.location} ${scene.time} ${scene.atmosphere}`.trim();
      const sceneTokens = tokenizeForMatch(sceneQuery);
      const paraTokens = tokenizeForMatch(paragraphText);
      if (sceneTokens.length === 0 || paraTokens.length === 0) return 0;

      const paraSet = new Set(paraTokens);
      const overlap = sceneTokens.filter(token => paraSet.has(token)).length;
      const overlapRatio = overlap / Math.max(1, sceneTokens.length);
      const containsLocation = paragraphText.includes(scene.location) ? 0.3 : 0;
      const containsTime = scene.time && paragraphText.includes(scene.time) ? 0.15 : 0;
      return overlapRatio + containsLocation + containsTime;
    };

    return (
      scene: Scene,
      sceneIndex: number
    ): { text: string; source: 'direct' | 'semantic' | 'neighbor' | 'global' | 'none' } => {
      const directParagraphs = (directParagraphMap.get(String(scene.id)) || []).filter(Boolean);
      if (directParagraphs.length > 0) {
        return { text: directParagraphs.join('\n'), source: 'direct' };
      }

      const allParagraphs = (data.storyParagraphs || [])
        .map(item => String(item.text || '').trim())
        .filter(Boolean);
      if (allParagraphs.length === 0) {
        return { text: '', source: 'none' };
      }

      const semanticCandidates = allParagraphs
        .map(text => ({ text, score: paragraphSceneScore(text, scene) }))
        .filter(entry => entry.score >= 0.18)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (semanticCandidates.length > 0) {
        return { text: semanticCandidates.map(entry => entry.text).join('\n'), source: 'semantic' };
      }

      const neighborTexts: string[] = [];
      for (let i = sceneIndex - 1; i >= 0; i -= 1) {
        const prevSceneId = sceneIdOrder[i];
        const texts = (directParagraphMap.get(prevSceneId) || []).filter(Boolean);
        if (texts.length > 0) {
          neighborTexts.push(texts.slice(-2).join('\n'));
          break;
        }
      }
      for (let i = sceneIndex + 1; i < sceneIdOrder.length; i += 1) {
        const nextSceneId = sceneIdOrder[i];
        const texts = (directParagraphMap.get(nextSceneId) || []).filter(Boolean);
        if (texts.length > 0) {
          neighborTexts.push(texts.slice(0, 2).join('\n'));
          break;
        }
      }
      if (neighborTexts.length > 0) {
        return { text: neighborTexts.join('\n'), source: 'neighbor' };
      }

      return { text: allParagraphs.slice(0, 2).join('\n'), source: 'global' };
    };
  };

  const resolveSceneActionText = createSceneActionResolver(scriptData);
  const resolvePreviousSceneActionText = previousScriptData
    ? createSceneActionResolver(previousScriptData)
    : null;

  const createFallbackShotsForScene = (
    scene: Scene,
    count: number,
    sceneText: string,
    seedShot?: any
  ): Shot[] => {
    const safeCount = Math.max(0, count);
    if (safeCount === 0) return [];

    const sceneSummary = sceneText.replace(/\s+/g, ' ').trim().slice(0, 220);
    const baseAction = String(seedShot?.actionSummary || sceneSummary || `${scene.location}场景推进`).trim();
    const baseMovement = String(seedShot?.cameraMovement || 'Static Shot').trim() || 'Static Shot';
    const baseShotSize = String(seedShot?.shotSize || 'Medium Shot').trim() || 'Medium Shot';
    const baseCharacters = Array.isArray(seedShot?.characters)
      ? seedShot.characters.map((c: any) => String(c)).filter((id: string) => validCharacterIds.has(id))
      : [];
    const baseProps = Array.isArray(seedShot?.props)
      ? seedShot.props.map((p: any) => String(p)).filter((id: string) => validPropIds.has(id))
      : [];

    return Array.from({ length: safeCount }, (_, idx) => {
      const sequence = idx + 1;
      const actionSummary = `${baseAction}（补足镜头 ${sequence}）`;
      return {
        id: `fallback-${scene.id}-${Date.now()}-${sequence}`,
        sceneId: String(scene.id),
        actionSummary,
        dialogue: '',
        cameraMovement: baseMovement,
        shotSize: baseShotSize,
        characters: baseCharacters,
        props: baseProps,
        keyframes: [
          {
            id: `fallback-kf-${scene.id}-${sequence}-start`,
            type: 'start',
            visualPrompt: `${actionSummary}，起始状态，${visualStyle}风格`,
            status: 'pending'
          },
          {
            id: `fallback-kf-${scene.id}-${sequence}-end`,
            type: 'end',
            visualPrompt: `${actionSummary}，结束状态，${visualStyle}风格`,
            status: 'pending'
          }
        ]
      } as Shot;
    });
  };

  const artDirectionBlock = artDir ? `
      ⚠️ GLOBAL ART DIRECTION (MANDATORY for ALL visualPrompt fields):
      ${artDir.consistencyAnchors}
      Color Palette: Primary=${artDir.colorPalette.primary}, Secondary=${artDir.colorPalette.secondary}, Accent=${artDir.colorPalette.accent}
      Color Temperature: ${artDir.colorPalette.temperature}, Saturation: ${artDir.colorPalette.saturation}
      Lighting Style: ${artDir.lightingStyle}
      Texture: ${artDir.textureStyle}
      Mood Keywords: ${artDir.moodKeywords.join(', ')}
      Character Proportions: ${artDir.characterDesignRules.proportions}
      Line/Edge Style: ${artDir.characterDesignRules.lineWeight}
      Detail Level: ${artDir.characterDesignRules.detailLevel}
` : '';

  const cloneShot = (shot: Shot): Shot => {
    if (typeof structuredClone === 'function') {
      return structuredClone(shot);
    }
    return JSON.parse(JSON.stringify(shot)) as Shot;
  };

  const reusableSceneBuckets = new Map<string, Shot[][]>();
  if (shouldReuseUnchangedScenes && previousScriptData && resolvePreviousSceneActionText) {
    const previousShotsByScene = new Map<string, Shot[]>();
    for (const shot of previousShots) {
      const key = String(shot.sceneId || '');
      if (!previousShotsByScene.has(key)) {
        previousShotsByScene.set(key, []);
      }
      previousShotsByScene.get(key)!.push(shot);
    }

    for (let index = 0; index < previousScriptData.scenes.length; index += 1) {
      const previousScene = previousScriptData.scenes[index];
      const sceneShots = previousShotsByScene.get(String(previousScene.id)) || [];
      if (sceneShots.length === 0) continue;

      const previousAction = resolvePreviousSceneActionText(previousScene, index).text;
      const signature = buildSceneReuseSignature({
        scene: previousScene,
        actionText: previousAction,
        shotsPerScene: sceneShots.length,
        visualStyle: previousScriptData.visualStyle || visualStyle,
        language: previousScriptData.language || lang,
        model: previousScriptData.shotGenerationModel || model,
        artDirectionSeed: previousScriptData.artDirection?.consistencyAnchors || ''
      });
      if (!reusableSceneBuckets.has(signature)) {
        reusableSceneBuckets.set(signature, []);
      }
      reusableSceneBuckets.get(signature)!.push(sceneShots.map(item => cloneShot(item)));
    }

    if (reusableSceneBuckets.size > 0) {
      logScriptProgress(`检测到可复用场景签名 ${reusableSceneBuckets.size} 组，生成阶段将优先复用未变场景。`);
    }
  }

  const processScene = async (scene: Scene, index: number): Promise<Shot[]> => {
    const sceneStartTime = Date.now();
    const shotsPerScene = sceneShotPlan[index] || 1;
    const actionSource = resolveSceneActionText(scene, index);
    const paragraphs = actionSource.text;

    if (shouldReuseUnchangedScenes && reusableSceneBuckets.size > 0) {
      const signature = buildSceneReuseSignature({
        scene,
        actionText: paragraphs,
        shotsPerScene,
        visualStyle,
        language: lang,
        model,
        artDirectionSeed: artDir?.consistencyAnchors || ''
      });
      const candidateGroup = reusableSceneBuckets.get(signature);
      if (candidateGroup && candidateGroup.length > 0) {
        const reused = candidateGroup.shift() || [];
        const remapped = reused.map((shot) => ({
          ...shot,
          sceneId: String(scene.id),
          characters: remapIds(shot.characters, characterIdRemap, validCharacterIds),
          props: remapIds(shot.props, propIdRemap, validPropIds),
          keyframes: normalizeShotKeyframes(shot, index, visualStyle)
        }));
        logScriptProgress(`场景「${scene.location}」命中增量复用，跳过AI分镜生成（复用 ${remapped.length} 条）`);
        return remapped;
      }
    }

    if (!paragraphs.trim()) {
      console.warn(`⚠️ 场景 ${index + 1} 缺少可用段落，使用兜底分镜填充 ${shotsPerScene} 条`);
      return createFallbackShotsForScene(
        scene,
        shotsPerScene,
        `${scene.location} ${scene.time} ${scene.atmosphere}`.trim()
      );
    }

    if (actionSource.source !== 'direct') {
      console.warn(`⚠️ 场景 ${index + 1} 使用 ${actionSource.source} 段落回填策略`);
      logScriptProgress(`场景「${scene.location}」段落映射缺失，已使用${actionSource.source}回填策略`);
    }

    const prompt = `
      Act as a professional cinematographer. Generate a detailed shot list (Camera blocking) for Scene ${index + 1}.
      Language for Text Output: ${lang}.
      
      IMPORTANT VISUAL STYLE: ${stylePrompt}
      All 'visualPrompt' fields MUST describe shots in this "${visualStyle}" style.
${artDirectionBlock}
      Scene Details:
      Location: ${scene.location}
      Time: ${scene.time}
      Atmosphere: ${scene.atmosphere}
      
      Scene Action:
      "${paragraphs.slice(0, 5000)}"
      Scene Action Source: ${actionSource.source}
      
      Context:
      Genre: ${scriptData.genre}
      Visual Style: ${visualStyle} (${stylePrompt})
      Target Duration (Whole Script): ${scriptData.targetDuration || 'Standard'}
      Active Video Model: ${activeVideoModel?.name || 'Default Video Model'}
      Shot Duration Baseline: ${shotDurationSeconds}s per shot
      Total Shots Budget: ${totalShotsNeeded} shots
      Shots for This Scene: ${shotsPerScene} shots (EXACT)
      
      Characters:
      ${JSON.stringify(scriptData.characters.map(c => ({ id: c.id, name: c.name, desc: c.visualPrompt || c.personality })))}
      Props:
      ${JSON.stringify((scriptData.props || []).map(p => ({ id: p.id, name: p.name, category: p.category, desc: p.description })))}

      Professional Camera Movement Reference (Choose from these categories):
      - Horizontal Left Shot (向左平移) - Camera moves left
      - Horizontal Right Shot (向右平移) - Camera moves right
      - Pan Left Shot (平行向左扫视) - Pan left
      - Pan Right Shot (平行向右扫视) - Pan right
      - Vertical Up Shot (向上直线运动) - Move up vertically
      - Vertical Down Shot (向下直线运动) - Move down vertically
      - Tilt Up Shot (向上仰角运动) - Tilt upward
      - Tilt Down Shot (向下俯角运动) - Tilt downward
      - Zoom Out Shot (镜头缩小/拉远) - Pull back/zoom out
      - Zoom In Shot (镜头放大/拉近) - Push in/zoom in
      - Dolly Shot (推镜头) - Dolly in/out movement
      - Circular Shot (环绕拍摄) - Orbit around subject
      - Over the Shoulder Shot (越肩镜头) - Over shoulder perspective
      - Pan Shot (摇镜头) - Pan movement
      - Low Angle Shot (仰视镜头) - Low angle view
      - High Angle Shot (俯视镜头) - High angle view
      - Tracking Shot (跟踪镜头) - Follow subject
      - Handheld Shot (摇摄镜头) - Handheld camera
      - Static Shot (静止镜头) - Fixed camera position
      - POV Shot (主观视角) - Point of view
      - Bird's Eye View Shot (俯瞰镜头) - Overhead view
      - 360-Degree Circular Shot (360度环绕) - Full circle
      - Parallel Tracking Shot (平行跟踪) - Side tracking
      - Diagonal Tracking Shot (对角跟踪) - Diagonal tracking
      - Rotating Shot (旋转镜头) - Rotating movement
      - Slow Motion Shot (慢动作) - Slow-mo effect
      - Time-Lapse Shot (延时摄影) - Time-lapse
      - Canted Shot (斜视镜头) - Dutch angle
      - Cinematic Dolly Zoom (电影式变焦推轨) - Vertigo effect

      Instructions:
      1. Create EXACTLY ${shotsPerScene} shots for this scene.
      2. CRITICAL: Each shot should represent about ${shotDurationSeconds} seconds. Total planning formula: ${targetSeconds} seconds ÷ ${shotDurationSeconds} ≈ ${totalShotsNeeded} shots across all scenes.
      3. DO NOT output more or fewer than ${shotsPerScene} shots for this scene.
      4. 'cameraMovement': Can reference the Professional Camera Movement Reference list above for inspiration, or use your own creative camera movements. You may use the exact English terms (e.g., "Dolly Shot", "Pan Right Shot", "Zoom In Shot", "Tracking Shot") or describe custom movements.
      5. 'shotSize': Specify the field of view (e.g., Extreme Close-up, Medium Shot, Wide Shot).
      6. 'actionSummary': Detailed description of what happens in the shot (in ${lang}).
      7. 'characters': Return ONLY IDs from provided Characters list.
      8. 'props': Return ONLY IDs from provided Props list when a prop is visibly involved. Use [] if none.
      9. 'visualPrompt': Detailed description for image generation in ${visualStyle} style (OUTPUT IN ${lang}). Include style-specific keywords.${artDir ? ' MUST follow the Global Art Direction color palette, lighting, and mood.' : ''} Keep it under 50 words.
      
      Output ONLY a valid JSON OBJECT with this exact structure (no markdown, no extra text):
      {
        "shots": [
          {
            "id": "string",
            "sceneId": "${scene.id}",
            "actionSummary": "string",
            "dialogue": "string (empty if none)",
            "cameraMovement": "string",
            "shotSize": "string",
            "characters": ["string"],
            "props": ["string"],
            "keyframes": [
              {"id": "string", "type": "start|end", "visualPrompt": "string (MUST include ${visualStyle} style keywords${artDir ? ' and follow Art Direction' : ''})"}
            ]
          }
        ]
      }
    `;

    let responseText = '';
    try {
      console.log(`  📡 场景 ${index + 1} API调用 - 模型:`, model);
      ensureNotAborted();
      responseText = await retryOperation(
        () => chatCompletion(prompt, model, 0.5, 8192, 'json_object', 600000, abortSignal),
        3,
        2000,
        abortSignal
      );
      const text = cleanJsonString(responseText);
      const parsed = JSON.parse(text);

      const shots = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray((parsed as any).shots) ? (parsed as any).shots : []);

      let validShots = Array.isArray(shots) ? shots : [];

      if (validShots.length !== shotsPerScene) {
        console.warn(`⚠️ 场景 ${index + 1} 返回分镜数量不符：期望 ${shotsPerScene}，实际 ${validShots.length}，尝试自动纠偏...`);
        const repairPrompt = `
You previously returned ${validShots.length} shots for Scene ${index + 1}, but EXACTLY ${shotsPerScene} shots are required.

Scene Details:
Location: ${scene.location}
Time: ${scene.time}
Atmosphere: ${scene.atmosphere}

Scene Action:
"${paragraphs.slice(0, 5000)}"

Requirements:
1. Return EXACTLY ${shotsPerScene} shots in JSON object format: {"shots":[...]}.
2. Keep story continuity and preserve the original cinematic intent.
3. Each shot represents about ${shotDurationSeconds} seconds.
4. Include fields: id, sceneId, actionSummary, dialogue, cameraMovement, shotSize, characters, props, keyframes.
5. characters/props must be arrays of valid IDs from provided context.
6. keyframes must include type=start/end and visualPrompt.
7. Output ONLY valid JSON object (no markdown).
`;

        try {
          const repairedText = await retryOperation(
            () => chatCompletion(repairPrompt, model, 0.4, 8192, 'json_object', 600000, abortSignal),
            2,
            2000,
            abortSignal
          );
          const repairedParsed = JSON.parse(cleanJsonString(repairedText));
          const repairedShots = Array.isArray(repairedParsed?.shots) ? repairedParsed.shots : [];
          if (repairedShots.length > 0) {
            validShots = repairedShots;
          }
        } catch (repairErr) {
          console.warn(`⚠️ 场景 ${index + 1} 分镜数量纠偏失败，将使用原始结果`, repairErr);
        }
      }

      let normalizedShots = validShots.length > shotsPerScene
        ? validShots.slice(0, shotsPerScene)
        : validShots;

      if (normalizedShots.length < shotsPerScene) {
        const missingCount = shotsPerScene - normalizedShots.length;
        const seedShot = normalizedShots[normalizedShots.length - 1];
        const fallbackShots = createFallbackShotsForScene(scene, missingCount, paragraphs, seedShot);
        normalizedShots = [...normalizedShots, ...fallbackShots];
        console.warn(`⚠️ 场景 ${index + 1} 分镜不足，已补足 ${missingCount} 条兜底分镜以满足精确数量约束`);
      }

      const result = normalizedShots.map((s: any, shotIndex: number) => {
        const normalizedCharacters = Array.from(
          new Set(
            (Array.isArray(s?.characters) ? s.characters : [])
              .map((id: any) => String(id))
              .filter((id: string) => validCharacterIds.has(id))
          )
        );
        const normalizedProps = Array.from(
          new Set(
            (Array.isArray(s?.props) ? s.props : [])
              .map((id: any) => String(id))
              .filter((id: string) => validPropIds.has(id))
          )
        );

        return {
          ...s,
          sceneId: String(scene.id),
          characters: normalizedCharacters,
          props: normalizedProps,
          keyframes: normalizeShotKeyframes(
            {
              ...(s as Shot),
              actionSummary: String(s?.actionSummary || '').trim()
            },
            shotIndex,
            visualStyle
          )
        };
      });

      addRenderLogWithTokens({
        type: 'script-parsing',
        resourceId: `shot-gen-scene-${scene.id}-${Date.now()}`,
        resourceName: `分镜生成 - 场景${index + 1}: ${scene.location}`,
        status: 'success',
        model: model,
        prompt: prompt.substring(0, 200) + '...',
        duration: Date.now() - sceneStartTime
      });

      return result;
    } catch (e: any) {
      console.error(`Failed to generate shots for scene ${scene.id}`, e);
      try {
        console.error(`  ↳ sceneId=${scene.id}, sceneIndex=${index}, responseText(snippet)=`, String(responseText || '').slice(0, 500));
      } catch {
        // ignore
      }

      addRenderLogWithTokens({
        type: 'script-parsing',
        resourceId: `shot-gen-scene-${scene.id}-${Date.now()}`,
        resourceName: `分镜生成 - 场景${index + 1}: ${scene.location}`,
        status: 'failed',
        model: model,
        prompt: prompt.substring(0, 200) + '...',
        error: e.message || String(e),
        duration: Date.now() - sceneStartTime
      });

      return createFallbackShotsForScene(scene, shotsPerScene, paragraphs);
    }
  };

  // Process scenes sequentially
  const BATCH_SIZE = 1;
  const allShots: Shot[] = [];

  for (let i = 0; i < scriptData.scenes.length; i += BATCH_SIZE) {
    ensureNotAborted();
    if (i > 0) await wait(1200);

    const batch = scriptData.scenes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((scene, idx) => processScene(scene, i + idx))
    );
    batchResults.forEach(shots => allShots.push(...shots));
  }

  if (allShots.length === 0) {
    throw new Error('分镜生成失败：AI返回为空（可能是 JSON 结构不匹配或场景内容未被识别）。请打开控制台查看分镜生成日志。');
  }

  const normalizedShots = allShots.map((s, idx) => ({
    ...s,
    id: `shot-${idx + 1}`,
    characters: Array.from(
      new Set(
        (Array.isArray(s.characters) ? s.characters : [])
          .map(id => String(id))
          .filter(id => validCharacterIds.has(id))
      )
    ),
    props: Array.from(
      new Set(
        (Array.isArray(s.props) ? s.props : [])
          .map(id => String(id))
          .filter(id => validPropIds.has(id))
      )
    ),
    keyframes: normalizeShotKeyframes(s, idx, visualStyle)
  }));

  const qualityCheckedShots = enableQualityCheck
    ? applyScriptStageQualityPipeline(
        normalizedShots,
        scriptData,
        validCharacterIds,
        validPropIds,
        visualStyle
      )
    : normalizedShots.map(shot => {
        if (!('qualityAssessment' in shot)) return shot;
        const { qualityAssessment, ...rest } = shot as Shot & { qualityAssessment?: ShotQualityAssessment };
        return rest as Shot;
      });
  if (!enableQualityCheck) {
    logScriptProgress('分镜质量校验已关闭，跳过自动打分与修复。');
  }
  logScriptProgress(`分镜生成完成，总耗时 ${Math.round((Date.now() - overallStartTime) / 1000)}s`);
  return qualityCheckedShots;
};

// ============================================
// 剧本续写/改写
// ============================================

/**
 * AI续写功能 - 基于已有剧本内容续写后续情节
 */
export const continueScript = async (existingScript: string, language: string = '中文', model: string = 'gpt-5.1'): Promise<string> => {
  console.log('✍️ continueScript 调用 - 使用模型:', model);
  const startTime = Date.now();

  const prompt = `
你是一位资深剧本创作者。请在充分理解下方已有剧本内容的基础上，续写后续情节。

续写要求：
1. 严格保持原剧本的风格、语气、人物性格和叙事节奏，确保无明显风格断层。
2. 情节发展需自然流畅，逻辑严密，因果关系合理，避免突兀转折。
3. 有效增加戏剧冲突和情感张力，使故事更具吸引力和张力。
4. 续写内容应为原有剧本长度的30%-50%，字数适中，避免过短或过长。
5. 保持剧本的原有格式，包括场景描述、人物对白、舞台指示等，确保格式一致。
6. 输出语言为：${language}，用词准确、表达流畅。
7. 仅输出续写剧本内容，不添加任何说明、前缀或后缀。

已有剧本内容：
${existingScript}

请直接续写剧本内容。（不要包含"续写："等前缀）：
`;

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.8, 4096));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'continue-script',
      resourceName: 'AI续写剧本',
      status: 'success',
      model,
      duration,
      prompt: existingScript.substring(0, 200) + '...'
    });

    return result;
  } catch (error) {
    console.error('❌ 续写失败:', error);
    throw error;
  }
};

/**
 * AI续写功能（流式）
 */
export const continueScriptStream = async (
  existingScript: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  onDelta?: (delta: string) => void
): Promise<string> => {
  console.log('✍️ continueScriptStream 调用 - 使用模型:', model);
  const startTime = Date.now();

  const prompt = `
你是一位资深剧本创作者。请在充分理解下方已有剧本内容的基础上，续写后续情节。

续写要求：
1. 严格保持原剧本的风格、语气、人物性格和叙事节奏，确保无明显风格断层。
2. 情节发展需自然流畅，逻辑严密，因果关系合理，避免突兀转折。
3. 有效增加戏剧冲突和情感张力，使故事更具吸引力和张力。
4. 续写内容应为原有剧本长度的30%-50%，字数适中，避免过短或过长。
5. 保持剧本的原有格式，包括场景描述、人物对白、舞台指示等，确保格式一致。
6. 输出语言为：${language}，用词准确、表达流畅。
7. 仅输出续写剧本内容，不添加任何说明、前缀或后缀。

已有剧本内容：
${existingScript}

请直接续写剧本内容。（不要包含"续写："等前缀）：
`;

  try {
    const result = await retryOperation(() => chatCompletionStream(prompt, model, 0.8, undefined, 600000, onDelta));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'continue-script',
      resourceName: 'AI续写剧本（流式）',
      status: 'success',
      model,
      duration,
      prompt: existingScript.substring(0, 200) + '...'
    });

    return result;
  } catch (error) {
    console.error('❌ 续写失败（流式）:', error);
    throw error;
  }
};

/**
 * AI改写功能 - 对整个剧本进行改写
 */
export const rewriteScript = async (originalScript: string, language: string = '中文', model: string = 'gpt-5.1'): Promise<string> => {
  console.log('🔄 rewriteScript 调用 - 使用模型:', model);
  const startTime = Date.now();

  const prompt = `
你是一位顶级剧本编剧顾问，擅长提升剧本的结构、情感和戏剧张力。请对下方提供的剧本进行系统性、创造性改写，目标是使剧本在连贯性、流畅性和戏剧冲突等方面显著提升。

改写具体要求如下：

1. 保留原剧本的核心故事线和主要人物设定，不改变故事主旨。
2. 优化情节结构，确保事件发展具有清晰的因果关系，逻辑严密。
3. 增强场景之间的衔接与转换，使整体叙事流畅自然。
4. 丰富和提升人物对话，使其更具个性、情感色彩和真实感，避免生硬或刻板。
5. 强化戏剧冲突，突出人物之间的矛盾与情感张力，增加情节的吸引力和感染力。
6. 深化人物内心活动和情感描写，提升剧本的情感深度。
7. 优化整体节奏，合理分配高潮与缓和段落，避免情节拖沓或推进过快。
8. 保持或适度增加剧本内容长度，确保内容充实但不过度冗长。
9. 严格遵循剧本格式规范，包括场景标注、人物台词、舞台指示等。
10. 输出语言为：${language}，确保语言风格与剧本类型相符。

原始剧本内容如下：
${originalScript}

请根据以上要求，输出经过全面改写、结构优化、情感丰富的完整剧本文本。
`;

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'rewrite-script',
      resourceName: 'AI改写剧本',
      status: 'success',
      model,
      duration,
      prompt: originalScript.substring(0, 200) + '...'
    });

    return result;
  } catch (error) {
    console.error('❌ 改写失败:', error);
    throw error;
  }
};

/**
 * AI改写功能（流式）
 */
export const rewriteScriptStream = async (
  originalScript: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  onDelta?: (delta: string) => void
): Promise<string> => {
  console.log('🔄 rewriteScriptStream 调用 - 使用模型:', model);
  const startTime = Date.now();

  const prompt = `
你是一位顶级剧本编剧顾问，擅长提升剧本的结构、情感和戏剧张力。请对下方提供的剧本进行系统性、创造性改写，目标是使剧本在连贯性、流畅性和戏剧冲突等方面显著提升。

改写具体要求如下：

1. 保留原剧本的核心故事线和主要人物设定，不改变故事主旨。
2. 优化情节结构，确保事件发展具有清晰的因果关系，逻辑严密。
3. 增强场景之间的衔接与转换，使整体叙事流畅自然。
4. 丰富和提升人物对话，使其更具个性、情感色彩和真实感，避免生硬或刻板。
5. 强化戏剧冲突，突出人物之间的矛盾与情感张力，增加情节的吸引力和感染力。
6. 深化人物内心活动和情感描写，提升剧本的情感深度。
7. 优化整体节奏，合理分配高潮与缓和段落，避免情节拖沓或推进过快。
8. 保持或适度增加剧本内容长度，确保内容充实但不过度冗长。
9. 严格遵循剧本格式规范，包括场景标注、人物台词、舞台指示等。
10. 输出语言为：${language}，确保语言风格与剧本类型相符。

原始剧本内容如下：
${originalScript}

请根据以上要求，输出经过全面改写、结构优化、情感丰富的完整剧本文本。
`;

  try {
    const result = await retryOperation(() => chatCompletionStream(prompt, model, 0.7, undefined, 600000, onDelta));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'rewrite-script',
      resourceName: 'AI改写剧本（流式）',
      status: 'success',
      model,
      duration,
      prompt: originalScript.substring(0, 200) + '...'
    });

    return result;
  } catch (error) {
    console.error('❌ 改写失败（流式）:', error);
    throw error;
  }
};

/**
 * AI局部改写功能 - 仅改写用户选中的片段
 */
export const rewriteScriptSegment = async (
  fullScript: string,
  selectedText: string,
  requirements: string,
  language: string = '中文',
  model: string = 'gpt-5.1'
): Promise<string> => {
  console.log('🧩 rewriteScriptSegment 调用 - 使用模型:', model);
  const startTime = Date.now();

  const prompt = `
你是一位顶级剧本编剧顾问。请基于上下文和改写要求，对“选中片段”进行精准改写。

硬性要求：
1. 只输出改写后的“选中片段”文本，不要输出完整剧本，不要解释说明。
2. 输出语言必须是：${language}。
3. 保持人物设定、世界观与上下文事实一致，除非改写要求明确要求改变。
4. 保持与前后文衔接自然，不出现突兀跳跃。
5. 尽量保持原片段格式（段落、台词、场景标记），除非改写要求另有指定。

【完整剧本（仅作上下文，不要整体改写）】
${fullScript.slice(0, 30000)}

【选中片段（只改写这里）】
${selectedText}

【改写要求】
${requirements}

请直接输出改写后的选中片段：
`;

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.7, 4096));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'rewrite-script-segment',
      resourceName: 'AI局部改写剧本',
      status: 'success',
      model,
      duration,
      prompt: `${requirements.substring(0, 120)}...`
    });

    return result;
  } catch (error) {
    console.error('❌ 局部改写失败:', error);
    throw error;
  }
};

/**
 * AI局部改写功能（流式）- 仅改写用户选中的片段
 */
export const rewriteScriptSegmentStream = async (
  fullScript: string,
  selectedText: string,
  requirements: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  onDelta?: (delta: string) => void
): Promise<string> => {
  console.log('🧩 rewriteScriptSegmentStream 调用 - 使用模型:', model);
  const startTime = Date.now();

  const prompt = `
你是一位顶级剧本编剧顾问。请基于上下文和改写要求，对“选中片段”进行精准改写。

硬性要求：
1. 只输出改写后的“选中片段”文本，不要输出完整剧本，不要解释说明。
2. 输出语言必须是：${language}。
3. 保持人物设定、世界观与上下文事实一致，除非改写要求明确要求改变。
4. 保持与前后文衔接自然，不出现突兀跳跃。
5. 尽量保持原片段格式（段落、台词、场景标记），除非改写要求另有指定。

【完整剧本（仅作上下文，不要整体改写）】
${fullScript.slice(0, 30000)}

【选中片段（只改写这里）】
${selectedText}

【改写要求】
${requirements}

请直接输出改写后的选中片段：
`;

  try {
    const result = await retryOperation(() => chatCompletionStream(prompt, model, 0.7, undefined, 600000, onDelta));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'rewrite-script-segment',
      resourceName: 'AI局部改写剧本（流式）',
      status: 'success',
      model,
      duration,
      prompt: `${requirements.substring(0, 120)}...`
    });

    return result;
  } catch (error) {
    console.error('❌ 局部改写失败（流式）:', error);
    throw error;
  }
};

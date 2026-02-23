/**
 * 视觉资产生成服务
 * 包含美术指导文档生成、角色/场景视觉提示词生成、图像生成
 */

import { Character, Scene, Prop, AspectRatio, ArtDirection, CharacterTurnaroundPanel } from "../../types";
import { addRenderLogWithTokens } from '../renderLogService';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  checkApiKey,
  getApiBase,
  getActiveModel,
  resolveModel,
  logScriptProgress,
  parseHttpError,
} from './apiCore';
import {
  getStylePrompt,
  getNegativePrompt,
  getSceneNegativePrompt,
} from './promptConstants';

// ============================================
// 美术指导文档生成
// ============================================

/**
 * 生成全局美术指导文档（Art Direction Brief）
 * 在生成任何角色/场景提示词之前调用，为整个项目建立统一的视觉风格基准。
 */
export const generateArtDirection = async (
  title: string,
  genre: string,
  logline: string,
  characters: { name: string; gender: string; age: string; personality: string }[],
  scenes: { location: string; time: string; atmosphere: string }[],
  visualStyle: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  abortSignal?: AbortSignal
): Promise<ArtDirection> => {
  console.log('🎨 generateArtDirection 调用 - 生成全局美术指导文档');
  logScriptProgress('正在生成全局美术指导文档（Art Direction）...');

  const stylePrompt = getStylePrompt(visualStyle);

  const prompt = `You are a world-class Art Director for ${visualStyle} productions. 
Your job is to create a unified Art Direction Brief that will guide ALL visual prompt generation for characters, scenes, and shots in a single project. This document ensures perfect visual consistency across every generated image.

## Project Info
- Title: ${title}
- Genre: ${genre}
- Logline: ${logline}
- Visual Style: ${visualStyle} (${stylePrompt})
- Language: ${language}

## Characters
${characters.map((c, i) => `${i + 1}. ${c.name} (${c.gender}, ${c.age}, ${c.personality})`).join('\n')}

## Scenes
${scenes.map((s, i) => `${i + 1}. ${s.location} - ${s.time} - ${s.atmosphere}`).join('\n')}

## Your Task
Create a comprehensive Art Direction Brief in JSON format. This brief will be injected into EVERY subsequent visual prompt to ensure all characters and scenes share a unified look and feel.

CRITICAL RULES:
- All descriptions must be specific, concrete, and actionable for image generation AI
- The brief must define a COHESIVE visual world - characters and scenes must look like they belong to the SAME production
- Color palette must be harmonious and genre-appropriate
- Character design rules must ensure all characters share the same art style while being visually distinct from each other
- Output all descriptive text in ${language}

Output ONLY valid JSON with this exact structure:
{
  "colorPalette": {
    "primary": "primary color tone description (e.g., 'deep navy blue with slight purple undertones')",
    "secondary": "secondary color description",
    "accent": "accent/highlight color",
    "skinTones": "skin tone range for characters in this style (e.g., 'warm ivory to golden tan, with soft peach undertones')",
    "saturation": "overall saturation tendency (e.g., 'medium-high, slightly desaturated for cinematic feel')",
    "temperature": "overall color temperature (e.g., 'cool-leaning with warm accent lighting')"
  },
  "characterDesignRules": {
    "proportions": "body proportion style (e.g., '7.5 head-to-body ratio, athletic builds, realistic proportions' or '6 head ratio, stylized anime proportions')",
    "eyeStyle": "unified eye rendering approach (e.g., 'large expressive anime eyes with detailed iris reflections' or 'realistic eye proportions with cinematic catchlights')",
    "lineWeight": "line/edge style (e.g., 'clean sharp outlines with 2px weight' or 'soft edges with no visible outlines, photorealistic blending')",
    "detailLevel": "detail density (e.g., 'high detail on faces and hands, medium on clothing textures, stylized backgrounds')"
  },
  "lightingStyle": "unified lighting approach (e.g., 'three-point cinematic lighting with strong rim light, warm key light from 45-degree angle, cool fill')",
  "textureStyle": "material/texture rendering style (e.g., 'smooth cel-shaded with subtle gradient shading' or 'photorealistic with visible skin pores and fabric weave')",
  "moodKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "consistencyAnchors": "A single comprehensive paragraph (80-120 words) that serves as the MASTER STYLE REFERENCE. This paragraph will be prepended to every character and scene prompt to anchor the visual style. It should describe: the overall rendering quality, the specific art style fingerprint, color grading approach, lighting philosophy, and the emotional tone of the visuals. Write it as direct instructions to an image generation AI."
}`;

  try {
    const responseText = await retryOperation(
      () => chatCompletion(prompt, model, 0.4, 4096, 'json_object', 600000, abortSignal),
      3,
      2000,
      abortSignal
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const artDirection: ArtDirection = {
      colorPalette: {
        primary: parsed.colorPalette?.primary || '',
        secondary: parsed.colorPalette?.secondary || '',
        accent: parsed.colorPalette?.accent || '',
        skinTones: parsed.colorPalette?.skinTones || '',
        saturation: parsed.colorPalette?.saturation || '',
        temperature: parsed.colorPalette?.temperature || '',
      },
      characterDesignRules: {
        proportions: parsed.characterDesignRules?.proportions || '',
        eyeStyle: parsed.characterDesignRules?.eyeStyle || '',
        lineWeight: parsed.characterDesignRules?.lineWeight || '',
        detailLevel: parsed.characterDesignRules?.detailLevel || '',
      },
      lightingStyle: parsed.lightingStyle || '',
      textureStyle: parsed.textureStyle || '',
      moodKeywords: Array.isArray(parsed.moodKeywords) ? parsed.moodKeywords : [],
      consistencyAnchors: parsed.consistencyAnchors || '',
    };

    console.log('✅ 全局美术指导文档生成完成:', artDirection.moodKeywords.join(', '));
    logScriptProgress('全局美术指导文档生成完成');
    return artDirection;
  } catch (error: any) {
    console.error('❌ 全局美术指导文档生成失败:', error);
    logScriptProgress('美术指导文档生成失败，将使用默认风格');
    return {
      colorPalette: { primary: '', secondary: '', accent: '', skinTones: '', saturation: '', temperature: '' },
      characterDesignRules: { proportions: '', eyeStyle: '', lineWeight: '', detailLevel: '' },
      lightingStyle: '',
      textureStyle: '',
      moodKeywords: [],
      consistencyAnchors: stylePrompt,
    };
  }
};

// ============================================
// 角色视觉提示词批量生成
// ============================================

/**
 * 批量生成所有角色的视觉提示词（Batch-Aware Generation）
 */
export const generateAllCharacterPrompts = async (
  characters: Character[],
  artDirection: ArtDirection,
  genre: string,
  visualStyle: string,
  language: string = '中文',
  model: string = 'gpt-5.1',
  abortSignal?: AbortSignal
): Promise<{ visualPrompt: string; negativePrompt: string }[]> => {
  console.log(`🎭 generateAllCharacterPrompts 调用 - 批量生成 ${characters.length} 个角色的视觉提示词`);
  logScriptProgress(`正在批量生成 ${characters.length} 个角色的视觉提示词（风格统一模式）...`);

  const stylePrompt = getStylePrompt(visualStyle);
  const negativePrompt = getNegativePrompt(visualStyle);

  if (characters.length === 0) return [];

  const characterList = characters.map((c, i) =>
    `Character ${i + 1} (ID: ${c.id}):
  - Name: ${c.name}
  - Gender: ${c.gender}
  - Age: ${c.age}
  - Personality: ${c.personality}`
  ).join('\n\n');

  const prompt = `You are an expert Art Director and AI prompt engineer for ${visualStyle} style image generation.
You must generate visual prompts for ALL ${characters.length} characters in a SINGLE response, ensuring they share a UNIFIED visual style while being visually distinct from each other.

## GLOBAL ART DIRECTION (MANDATORY - ALL characters MUST follow this)
${artDirection.consistencyAnchors}

### Color Palette
- Primary: ${artDirection.colorPalette.primary}
- Secondary: ${artDirection.colorPalette.secondary}
- Accent: ${artDirection.colorPalette.accent}
- Skin Tones: ${artDirection.colorPalette.skinTones}
- Saturation: ${artDirection.colorPalette.saturation}
- Temperature: ${artDirection.colorPalette.temperature}

### Character Design Rules (APPLY TO ALL)
- Proportions: ${artDirection.characterDesignRules.proportions}
- Eye Style: ${artDirection.characterDesignRules.eyeStyle}
- Line Weight: ${artDirection.characterDesignRules.lineWeight}
- Detail Level: ${artDirection.characterDesignRules.detailLevel}

### Rendering
- Lighting: ${artDirection.lightingStyle}
- Texture: ${artDirection.textureStyle}
- Mood Keywords: ${artDirection.moodKeywords.join(', ')}

## Genre: ${genre}
## Technical Quality: ${stylePrompt}

## Characters to Generate
${characterList}

## REQUIRED PROMPT STRUCTURE (for EACH character, output in ${language}):
1. Core Identity: [ethnicity, age, gender, body type - MUST follow proportions rule above]
2. Facial Features: [specific distinguishing features - eyes MUST follow eye style rule, nose, face shape, skin tone MUST use palette skin tones]
3. Hairstyle: [detailed hair description - color, length, style]
4. Clothing: [detailed outfit appropriate for ${genre} genre, colors MUST harmonize with palette]
5. Pose & Expression: [body language and facial expression matching personality]
6. Technical Quality: ${stylePrompt}

## CRITICAL CONSISTENCY RULES:
1. ALL characters MUST share the SAME art style as defined by the Art Direction above.
2. ALL characters' color schemes MUST harmonize within the defined color palette.
3. ALL characters MUST use the SAME proportions: ${artDirection.characterDesignRules.proportions}
4. ALL characters MUST use the SAME line/edge style: ${artDirection.characterDesignRules.lineWeight}
5. ALL characters MUST have the SAME detail density: ${artDirection.characterDesignRules.detailLevel}
6. Each character should be VISUALLY DISTINCT from others through clothing, hair color, accessories, and body language
   - but STYLISTICALLY UNIFIED in rendering quality, detail density, color harmony, and art style.
7. Skin tone descriptions must be from the same tonal family: ${artDirection.colorPalette.skinTones}
8. Sections 1-3 (Core Identity, Facial Features, Hairstyle) are FIXED features for each character for consistency across all variations.

## OUTPUT FORMAT
Output ONLY valid JSON with this structure:
{
  "characters": [
    {
      "id": "character_id",
      "visualPrompt": "single paragraph, comma-separated, 60-90 words, MUST include ${visualStyle} style keywords"
    }
  ]
}

The "characters" array MUST have exactly ${characters.length} items, in the SAME ORDER as the input.
Output ONLY the JSON, no explanations.`;

  try {
    const responseText = await retryOperation(
      () => chatCompletion(prompt, model, 0.4, 4096, 'json_object', 600000, abortSignal),
      3,
      2000,
      abortSignal
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const results: { visualPrompt: string; negativePrompt: string }[] = [];
    const charResults = Array.isArray(parsed.characters) ? parsed.characters : [];

    for (let i = 0; i < characters.length; i++) {
      const charResult = charResults[i];
      if (charResult && charResult.visualPrompt) {
        results.push({
          visualPrompt: charResult.visualPrompt.trim(),
          negativePrompt: negativePrompt,
        });
        console.log(`  ✅ 角色 ${characters[i].name} 提示词生成成功`);
      } else {
        console.warn(`  ⚠️ 角色 ${characters[i].name} 在批量结果中缺失，将使用后备方案`);
        results.push({
          visualPrompt: '',
          negativePrompt: negativePrompt,
        });
      }
    }

    console.log(`✅ 批量角色视觉提示词生成完成: ${results.filter(r => r.visualPrompt).length}/${characters.length} 成功`);
    logScriptProgress(`角色视觉提示词批量生成完成 (${results.filter(r => r.visualPrompt).length}/${characters.length})`);
    return results;
  } catch (error: any) {
    console.error('❌ 批量角色视觉提示词生成失败:', error);
    logScriptProgress('批量角色提示词生成失败，将回退到逐个生成模式');
    return characters.map(() => ({ visualPrompt: '', negativePrompt: negativePrompt }));
  }
};

// ============================================
// 单个角色/场景视觉提示词生成
// ============================================

/**
 * 生成角色或场景的视觉提示词
 */
export const generateVisualPrompts = async (
  type: 'character' | 'scene' | 'prop',
  data: Character | Scene | Prop,
  genre: string,
  model: string = 'gpt-5.1',
  visualStyle: string = 'live-action',
  language: string = '中文',
  artDirection?: ArtDirection,
  abortSignal?: AbortSignal
): Promise<{ visualPrompt: string; negativePrompt: string }> => {
  const stylePrompt = getStylePrompt(visualStyle);
  const negativePrompt = type === 'scene'
    ? getSceneNegativePrompt(visualStyle)
    : getNegativePrompt(visualStyle);

  // 构建 Art Direction 注入段落
  const artDirectionBlock = artDirection ? `
## GLOBAL ART DIRECTION (MANDATORY - MUST follow this for visual consistency)
${artDirection.consistencyAnchors}

Color Palette: Primary=${artDirection.colorPalette.primary}, Secondary=${artDirection.colorPalette.secondary}, Accent=${artDirection.colorPalette.accent}
Color Temperature: ${artDirection.colorPalette.temperature}, Saturation: ${artDirection.colorPalette.saturation}
Lighting: ${artDirection.lightingStyle}
Texture: ${artDirection.textureStyle}
Mood Keywords: ${artDirection.moodKeywords.join(', ')}
` : '';

  let prompt: string;

  if (type === 'character') {
    const char = data as Character;
    prompt = `You are an expert AI prompt engineer for ${visualStyle} style image generation.
${artDirectionBlock}
Create a detailed visual prompt for a character with the following structure:

Character Data:
- Name: ${char.name}
- Gender: ${char.gender}
- Age: ${char.age}
- Personality: ${char.personality}

REQUIRED STRUCTURE (output in ${language}):
1. Core Identity: [ethnicity, age, gender, body type${artDirection ? ` - MUST follow proportions: ${artDirection.characterDesignRules.proportions}` : ''}]
2. Facial Features: [specific distinguishing features - eyes${artDirection ? ` (MUST follow eye style: ${artDirection.characterDesignRules.eyeStyle})` : ''}, nose, face shape, skin tone${artDirection ? ` (MUST use skin tones from: ${artDirection.colorPalette.skinTones})` : ''}]
3. Hairstyle: [detailed hair description - color, length, style]
4. Clothing: [detailed outfit appropriate for ${genre} genre${artDirection ? `, colors MUST harmonize with palette: ${artDirection.colorPalette.primary}, ${artDirection.colorPalette.secondary}` : ''}]
5. Pose & Expression: [body language and facial expression matching personality]
6. Technical Quality: ${stylePrompt}

CRITICAL RULES:
- Sections 1-3 are FIXED features for consistency across all variations${artDirection ? `
- MUST follow the Global Art Direction above for style consistency
- Line/edge style: ${artDirection.characterDesignRules.lineWeight}
- Detail density: ${artDirection.characterDesignRules.detailLevel}` : ''}
- Use specific, concrete visual details
- Output as single paragraph, comma-separated
- MUST include style keywords: ${visualStyle}
- Length: 60-90 words
- Focus on visual details that can be rendered in images

Output ONLY the visual prompt text, no explanations.`;
  } else if (type === 'scene') {
    const scene = data as Scene;
    prompt = `You are an expert cinematographer and AI prompt engineer for ${visualStyle} productions.
${artDirectionBlock}
Create a cinematic scene/environment prompt with this structure:

Scene Data:
- Location: ${scene.location}
- Time: ${scene.time}
- Atmosphere: ${scene.atmosphere}
- Genre: ${genre}

REQUIRED STRUCTURE (output in ${language}):
1. Environment: [detailed location description with architectural/natural elements, props, furniture, vehicles, or objects that tell the story of the space]
2. Lighting: [specific lighting setup${artDirection ? ` - MUST follow project lighting style: ${artDirection.lightingStyle}` : ' - direction, color temperature, quality (soft/hard), key light source'}]
3. Composition: [camera angle (eye-level/low/high), framing rules (rule of thirds/symmetry), depth layers]
4. Atmosphere: [mood, weather, particles in air (fog/dust/rain), environmental effects]
5. Color Palette: [${artDirection ? `MUST use project palette - Primary: ${artDirection.colorPalette.primary}, Secondary: ${artDirection.colorPalette.secondary}, Accent: ${artDirection.colorPalette.accent}, Temperature: ${artDirection.colorPalette.temperature}` : 'dominant colors, color temperature (warm/cool), saturation level'}]
6. Technical Quality: ${stylePrompt}

CRITICAL RULES:
- ⚠️ ABSOLUTELY NO PEOPLE, CHARACTERS, HUMAN FIGURES, OR SILHOUETTES in the scene - this is a PURE ENVIRONMENT/BACKGROUND shot
- The scene must be an EMPTY environment - no humans, no crowds, no pedestrians, no figures in the distance${artDirection ? `
- ⚠️ MUST follow the Global Art Direction above - this scene must visually match the same project as all characters
- Texture/material rendering: ${artDirection.textureStyle}
- Mood: ${artDirection.moodKeywords.join(', ')}` : ''}
- Use professional cinematography terminology
- Specify light sources and direction (e.g., "golden hour backlight from right")
- Include composition guidelines (rule of thirds, leading lines, depth of field)
- You may include environmental storytelling elements (e.g., an abandoned coffee cup, footprints in snow, a parked car) to make the scene feel lived-in without showing people
- Output as single paragraph, comma-separated
- MUST emphasize ${visualStyle} style throughout
- Length: 70-110 words
- Focus on elements that establish mood and cinematic quality

Output ONLY the visual prompt text, no explanations.`;
  } else {
    const prop = data as Prop;
    prompt = `You are an expert prop/product prompt engineer for ${visualStyle} style image generation.
${artDirectionBlock}
Create a cinematic visual prompt for a standalone prop/item.

Prop Data:
- Name: ${prop.name}
- Category: ${prop.category}
- Description: ${prop.description}
- Genre Context: ${genre}

REQUIRED STRUCTURE (output in ${language}):
1. Form & Silhouette: [overall shape, scale cues, distinctive outline]
2. Material & Texture: [material type, micro texture, wear/age details]
3. Color & Finish: [primary/secondary/accent colors, finish level]
4. Craft & Details: [logos, engravings, seams, patterns, moving parts]
5. Presentation: [clean product-shot framing, controlled studio/cinematic lighting]
6. Technical Quality: ${stylePrompt}

CRITICAL RULES:
- Object-only shot, absolutely NO people, NO characters, NO hands
- Keep identity-defining details concrete and renderable
- Output as single paragraph, comma-separated
- MUST emphasize ${visualStyle} style
- Length: 55-95 words

Output ONLY the visual prompt text, no explanations.`;
  }

  const visualPrompt = await retryOperation(
    () => chatCompletion(prompt, model, 0.5, 1024, undefined, 600000, abortSignal),
    3,
    2000,
    abortSignal
  );

  return {
    visualPrompt: visualPrompt.trim(),
    negativePrompt: negativePrompt
  };
};

// ============================================
// 图像生成
// ============================================

/**
 * 生成图像
 * 使用图像生成API，支持参考图像确保角色和场景一致性
 */
type ReferencePackType = 'shot' | 'character' | 'scene' | 'prop';
type ImageModelRoutingFamily = 'nano-banana' | 'generic';

const resolveImageModelRoutingFamily = (model: any): ImageModelRoutingFamily => {
  const identity = `${model?.id || ''} ${model?.apiModel || ''} ${model?.name || ''}`.toLowerCase();
  const isNanoBanana =
    identity.includes('gemini-3-pro-image-preview') ||
    identity.includes('nano banana') ||
    identity.includes('gemini 3 pro image');
  return isNanoBanana ? 'nano-banana' : 'generic';
};

const buildImageRoutingPrefix = (
  family: ImageModelRoutingFamily,
  context: {
    hasAnyReference: boolean;
    referencePackType: ReferencePackType;
    isVariation: boolean;
  }
): string => {
  if (family !== 'nano-banana') {
    return '';
  }

  if (context.isVariation) {
    return `MODEL ROUTING: Nano Banana Pro - character variation mode.
- Lock face identity from references first.
- Apply outfit change from text prompt while preserving identity, body proportions, and style consistency.`;
  }

  if (!context.hasAnyReference) {
    return `MODEL ROUTING: Nano Banana Pro - text-driven generation mode.
- Follow the textual prompt precisely for subject, camera, and composition.
- Avoid introducing extra characters or objects not required by the prompt.`;
  }

  if (context.referencePackType === 'character') {
    return `MODEL ROUTING: Nano Banana Pro - character reference mode.
- Treat provided references as the primary identity anchor.
- Keep face, hair, outfit materials, and body proportions consistent across outputs.`;
  }

  if (context.referencePackType === 'scene') {
    return `MODEL ROUTING: Nano Banana Pro - scene reference mode.
- Preserve environment layout, lighting logic, atmosphere, and style continuity from references.
- Keep composition coherent with prompt instructions.`;
  }

  if (context.referencePackType === 'prop') {
    return `MODEL ROUTING: Nano Banana Pro - prop reference mode.
- Preserve prop shape, materials, color, and distinguishing details.
- Do not redesign key prop identity.`;
  }

  return `MODEL ROUTING: Nano Banana Pro - shot reference mode.
- Prioritize reference continuity for scene, character identity, and prop details.
- Then apply the textual action and camera intent.`;
};

const buildImageApiError = (status: number, backendMessage?: string): Error => {
  const detail = backendMessage?.trim();
  const withDetail = (message: string): string => (detail ? `${message}（接口信息：${detail}）` : message);

  let message: string;
  if (status === 400) {
    message = withDetail('图片生成失败：提示词可能被风控拦截，请修改提示词后重试。');
  } else if (status === 500 || status === 503) {
    message = withDetail('图片生成失败：服务器繁忙，请稍后重试。');
  } else if (status === 429) {
    message = withDetail('图片生成失败：请求过于频繁，请稍后再试。');
  } else {
    message = withDetail(`图片生成失败：接口请求异常（HTTP ${status}）。`);
  }

  const err: any = new Error(message);
  err.status = status;
  return err;
};

const MAX_IMAGE_PROMPT_CHARS = 5000;

const truncatePromptToMaxChars = (
  input: string,
  maxChars: number
): { text: string; wasTruncated: boolean; originalLength: number } => {
  const chars = Array.from(input);
  const originalLength = chars.length;
  if (originalLength <= maxChars) {
    return { text: input, wasTruncated: false, originalLength };
  }
  return {
    text: chars.slice(0, maxChars).join(''),
    wasTruncated: true,
    originalLength,
  };
};

const countEnglishWords = (text: string): number => {
  const matches = String(text || '').trim().match(/[A-Za-z0-9'-]+/g);
  return matches ? matches.length : 0;
};

export const generateImage = async (
  prompt: string,
  referenceImages: string[] = [],
  aspectRatio: AspectRatio = '16:9',
  isVariation: boolean = false,
  hasTurnaround: boolean = false,
  negativePrompt: string = '',
  options?: {
    continuityReferenceImage?: string;
    referencePackType?: ReferencePackType;
  }
): Promise<string> => {
  const startTime = Date.now();
  const continuityReferenceImage = options?.continuityReferenceImage;
  const referencePackType = options?.referencePackType || 'shot';
  const hasAnyReference = referenceImages.length > 0 || !!continuityReferenceImage;

  const activeImageModel = getActiveModel('image');
  const imageRoutingFamily = resolveImageModelRoutingFamily(activeImageModel);
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'gemini-3-pro-image-preview';
  const imageModelEndpoint = activeImageModel?.endpoint || `/v1beta/models/${imageModelId}:generateContent`;
  const apiKey = checkApiKey('image', activeImageModel?.id);
  const apiBase = getApiBase('image', activeImageModel?.id);

  try {
    let finalPrompt = prompt;
    if (hasAnyReference) {
      if (isVariation) {
        finalPrompt = `
      ⚠️⚠️⚠️ CRITICAL REQUIREMENTS - CHARACTER OUTFIT VARIATION ⚠️⚠️⚠️
      
      Reference Images Information:
      - The provided image shows the CHARACTER's BASE APPEARANCE that you MUST use as reference for FACE ONLY.
      
      Task:
      Generate a character image with a NEW OUTFIT/COSTUME based on this description: "${prompt}".
      
      ⚠️ ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE):
      
      1. FACE & IDENTITY - MUST BE 100% IDENTICAL TO REFERENCE:
         • Facial Features: Eyes (color, shape, size), nose structure, mouth shape, facial contours must be EXACTLY the same
         • Hairstyle & Hair Color: Length, color, texture, and style must be PERFECTLY matched (unless prompt specifies hair change)
         • Skin tone and facial structure: MUST remain identical
         • Expression can vary based on prompt
         
      2. OUTFIT/CLOTHING - MUST BE COMPLETELY DIFFERENT FROM REFERENCE:
         • Generate NEW clothing/outfit as described in the prompt
         • DO NOT copy the clothing from the reference image
         • The outfit should match the description provided: "${prompt}"
         • Include all accessories, props, or costume details mentioned in the prompt
         
      3. Body proportions should remain consistent with the reference.
      
      ⚠️ This is an OUTFIT VARIATION task - The face MUST match the reference, but the CLOTHES MUST be NEW as described!
      ⚠️ If the new outfit is not clearly visible and different from the reference, the task has FAILED!
    `;
      } else {
        // 九宫格造型图说明段落（仅在有九宫格时注入）
        const baseReferenceGuide = (() => {
          if (referenceImages.length === 0) {
            return '- No explicit reference pack is provided. Use the textual prompt as the primary source for composition.';
          }

          if (referencePackType === 'character') {
            return `- All provided images are CHARACTER references for the SAME character identity.
      - Treat every image as identity reference priority (face, hair, body proportions, outfit details).${hasTurnaround ? '\n      - Some images are 3x3 TURNAROUND SHEETS showing the same character from multiple angles.' : ''}`;
          }

          if (referencePackType === 'scene') {
            return '- All provided images are SCENE/ENVIRONMENT references. Preserve location layout, atmosphere, lighting logic, and art direction.';
          }

          if (referencePackType === 'prop') {
            return '- All provided images are PROP/ITEM references. Preserve object shape, color, materials, and distinguishing details.';
          }

          return `- The FIRST image is the Scene/Environment reference.
      - Subsequent images are Character references (Base Look or Variation).${hasTurnaround ? '\n      - Some character images are 3x3 TURNAROUND SHEETS showing the character from 9 different angles (front, side, back, close-up, etc.).' : ''}
      - Any remaining images after characters are Prop/Item references (objects that must appear consistently).`;
        })();
        const taskLabel = referencePackType === 'character'
          ? 'character image'
          : referencePackType === 'scene'
            ? 'scene/environment image'
            : referencePackType === 'prop'
              ? 'prop/item image'
              : 'cinematic shot';
        const sceneConsistencyRule = referencePackType === 'shot'
          ? '- STRICTLY maintain the visual style, lighting, and environment from the scene reference.'
          : referencePackType === 'scene'
            ? '- STRICTLY maintain location layout, atmosphere, and lighting logic from scene references.'
            : '- Keep visual style and lighting coherent with the prompt and provided references.';
        const characterConsistencyRule = referencePackType === 'character'
          ? 'If character references are provided, the generated character MUST remain IDENTICAL to references:'
          : 'If characters are present in the prompt, they MUST be IDENTICAL to the character reference images:';
        const propConsistencyRule = referencePackType === 'prop'
          ? 'If prop reference images are provided, the props/items MUST match the references exactly:'
          : 'If prop reference images are provided, the objects/items in the shot MUST match the reference:';
        const continuityGuide = continuityReferenceImage
          ? '\n      - The LAST image is a continuity reference (previous/start keyframe). Use it to keep character identity, outfit, lighting, and spatial continuity. Do NOT treat it as a prop reference.'
          : '';
        const turnaroundGuide = hasTurnaround ? `
      4. CHARACTER TURNAROUND SHEET - MULTI-ANGLE REFERENCE:
         Some character reference images are provided as a 3x3 TURNAROUND SHEET (9-panel grid showing the SAME character from different angles: front, side, back, 3/4 view, close-up, etc.).
         ⚠️ This turnaround sheet is your MOST IMPORTANT reference for character consistency!
         • Use the panel that best matches the CAMERA ANGLE of this shot (e.g., if the shot is from behind, refer to the back-view panel)
         • The character's face, hair, clothing, and body proportions must match ALL panels in the turnaround sheet
         • The turnaround sheet takes priority over single character reference images for angle-specific details
         ` : '';

        finalPrompt = `
      ⚠️⚠️⚠️ CRITICAL REQUIREMENTS - CHARACTER CONSISTENCY ⚠️⚠️⚠️
      
      Reference Images Information:
      ${baseReferenceGuide}${continuityGuide}
      
      Task:
      Generate a ${taskLabel} matching this prompt: "${prompt}".
      
      ⚠️ ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE):
      1. Scene Consistency:
         ${sceneConsistencyRule}
      
      2. Character Consistency - HIGHEST PRIORITY:
         ${characterConsistencyRule}
         • Facial Features: Eyes (color, shape, size), nose structure, mouth shape, facial contours must be EXACTLY the same
         • Hairstyle & Hair Color: Length, color, texture, and style must be PERFECTLY matched
         • Clothing & Outfit: Style, color, material, and accessories must be IDENTICAL
         • Body Type: Height, build, proportions must remain consistent
      
      3. Prop/Item Consistency:
         ${propConsistencyRule}
         • Shape & Form: The prop's shape, size, and proportions must be identical to the reference
         • Color & Material: Colors, textures, and materials must be consistent
         • Details: Patterns, text, decorations, and distinguishing features must match exactly
      ${turnaroundGuide}
      ⚠️ DO NOT create variations or interpretations of the character - STRICT REPLICATION ONLY!
      ⚠️ Character appearance consistency is THE MOST IMPORTANT requirement!
      ⚠️ Props/items must also maintain visual consistency with their reference images!
    `;
      }
    }

    const modelRoutingPrefix = buildImageRoutingPrefix(imageRoutingFamily, {
      hasAnyReference,
      referencePackType,
      isVariation,
    });
    if (modelRoutingPrefix) {
      finalPrompt = `${modelRoutingPrefix}\n\n${finalPrompt}`;
    }

    if (negativePrompt.trim()) {
      finalPrompt = `${finalPrompt}

NEGATIVE PROMPT (strictly avoid all of the following): ${negativePrompt.trim()}`;
    }

    const promptLimitResult = truncatePromptToMaxChars(finalPrompt, MAX_IMAGE_PROMPT_CHARS);
    if (promptLimitResult.wasTruncated) {
      console.warn(
        `[ImagePrompt] Prompt exceeded ${MAX_IMAGE_PROMPT_CHARS} chars ` +
        `(${promptLimitResult.originalLength}). Truncated before image request.`
      );
    }
    finalPrompt = promptLimitResult.text;

    const parts: any[] = [{ text: finalPrompt }];

    referenceImages.forEach((imgUrl) => {
      const match = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    });

    if (continuityReferenceImage && !referenceImages.includes(continuityReferenceImage)) {
      const continuityMatch = continuityReferenceImage.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      if (continuityMatch) {
        parts.push({
          inlineData: {
            mimeType: continuityMatch[1],
            data: continuityMatch[2]
          }
        });
      }
    }

    const requestBody: any = {
      contents: [{
        role: "user",
        parts: parts
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    };

    if (aspectRatio !== '16:9') {
      requestBody.generationConfig.imageConfig = {
        aspectRatio: aspectRatio
      };
    }

    const response = await retryOperation(async () => {
      const res = await fetch(`${apiBase}${imageModelEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': '*/*'
        },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const parsedError = await parseHttpError(res);
        const parsedAny: any = parsedError;
        const status = parsedAny.status || res.status;
        throw buildImageApiError(status, parsedError.message);
      }

      return await res.json();
    });

    const candidates = response.candidates || [];
    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          const result = `data:image/png;base64,${part.inlineData.data}`;

          addRenderLogWithTokens({
            type: 'keyframe',
            resourceId: 'image-' + Date.now(),
            resourceName: prompt.substring(0, 50) + '...',
            status: 'success',
            model: imageModelId,
            prompt: prompt,
            duration: Date.now() - startTime
          });

          return result;
        }
      }
    }

    const hasSafetyBlock =
      !!response?.promptFeedback?.blockReason ||
      candidates.some((candidate: any) => {
        const finishReason = String(candidate?.finishReason || '').toUpperCase();
        return finishReason.includes('SAFETY') || finishReason.includes('BLOCK');
      });

    if (hasSafetyBlock) {
      throw new Error('图片生成失败：提示词可能被风控拦截，请修改提示词后重试。');
    }

    throw new Error('图片生成失败：未返回有效图片数据，请重试或调整提示词。');
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'image-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt: prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw error;
  }
};

// ============================================
// 角色九宫格造型设计（Turnaround Sheet）
// ============================================

/**
 * 角色九宫格造型设计 - 默认视角布局
 * 覆盖常用的拍摄角度，确保角色从各方向都有参考
 */
const resolveTurnaroundAspectRatio = (): AspectRatio => {
  const preferredOrder: AspectRatio[] = ['1:1', '16:9', '9:16'];
  const activeImageModel = getActiveModel('image');
  const supportedRatios =
    activeImageModel?.type === 'image'
      ? activeImageModel.params.supportedAspectRatios
      : undefined;

  if (supportedRatios && supportedRatios.length > 0) {
    for (const ratio of preferredOrder) {
      if (supportedRatios.includes(ratio)) {
        return ratio;
      }
    }
    return supportedRatios[0];
  }

  return '1:1';
};

export const CHARACTER_TURNAROUND_LAYOUT = {
  panelCount: 9,
  defaultPanels: [
    { index: 0, viewAngle: '正面', shotSize: '全身', description: '' },
    { index: 1, viewAngle: '正面', shotSize: '半身特写', description: '' },
    { index: 2, viewAngle: '正面', shotSize: '面部特写', description: '' },
    { index: 3, viewAngle: '左侧面', shotSize: '全身', description: '' },
    { index: 4, viewAngle: '右侧面', shotSize: '全身', description: '' },
    { index: 5, viewAngle: '3/4侧面', shotSize: '半身', description: '' },
    { index: 6, viewAngle: '背面', shotSize: '全身', description: '' },
    { index: 7, viewAngle: '仰视', shotSize: '半身', description: '' },
    { index: 8, viewAngle: '俯视', shotSize: '半身', description: '' },
  ],
  viewAngles: ['正面', '左侧面', '右侧面', '3/4左侧', '3/4右侧', '背面', '仰视', '俯视', '斜后方'],
  shotSizes: ['全身', '半身', '半身特写', '面部特写', '大特写'],
  positionLabels: [
    '左上 (Top-Left)', '中上 (Top-Center)', '右上 (Top-Right)',
    '左中 (Middle-Left)', '正中 (Center)', '右中 (Middle-Right)',
    '左下 (Bottom-Left)', '中下 (Bottom-Center)', '右下 (Bottom-Right)'
  ],
};

/**
 * 生成角色九宫格造型描述（AI拆分9个视角）
 * 根据角色信息和视觉提示词，生成9个不同视角的详细描述
 */
export const generateCharacterTurnaroundPanels = async (
  character: Character,
  visualStyle: string,
  artDirection?: ArtDirection,
  language: string = '中文',
  model: string = 'gpt-5.1'
): Promise<CharacterTurnaroundPanel[]> => {
  console.log(`🎭 generateCharacterTurnaroundPanels - 为角色 ${character.name} 生成九宫格造型视角`);
  logScriptProgress(`正在为角色「${character.name}」生成九宫格造型视角描述...`);

  const stylePrompt = getStylePrompt(visualStyle);

  // 构建 Art Direction 注入
  const artDirectionBlock = artDirection ? `
## GLOBAL ART DIRECTION (MANDATORY)
${artDirection.consistencyAnchors}
Color Palette: Primary=${artDirection.colorPalette.primary}, Secondary=${artDirection.colorPalette.secondary}, Accent=${artDirection.colorPalette.accent}
Character Design: Proportions=${artDirection.characterDesignRules.proportions}, Eye Style=${artDirection.characterDesignRules.eyeStyle}
Lighting: ${artDirection.lightingStyle}, Texture: ${artDirection.textureStyle}
` : '';

  const prompt = `You are a character design director for ${visualStyle}.
Create a 3x3 CHARACTER TURNAROUND plan (9 panels) for the SAME character.

${artDirectionBlock}
Character:
- Name: ${character.name}
- Gender: ${character.gender}
- Age: ${character.age}
- Personality: ${character.personality}
- Visual Description: ${character.visualPrompt || 'Not specified'}

Visual Style: ${visualStyle} (${stylePrompt})

Required panel layout (index 0-8):
0 Top-Left: 正面 / 全身
1 Top-Center: 正面 / 半身特写
2 Top-Right: 正面 / 面部特写
3 Middle-Left: 左侧面 / 全身
4 Center: 右侧面 / 全身
5 Middle-Right: 3/4侧面 / 半身
6 Bottom-Left: 背面 / 全身
7 Bottom-Center: 仰视 / 半身
8 Bottom-Right: 俯视 / 半身

Output JSON only:
{
  "panels": [
    { "index": 0, "viewAngle": "正面", "shotSize": "全身", "description": "..." }
  ]
}

Rules:
- Exactly 9 panels, index 0-8 in order
- Keep face/hair/body/clothing/accessories consistent across all panels
- description must be one concise English sentence (10-30 words) with key visible details for that angle`;

  try {
    const buildPanels = (parsed: any): CharacterTurnaroundPanel[] => {
      const built: CharacterTurnaroundPanel[] = [];
      const rawPanels = Array.isArray(parsed.panels) ? parsed.panels : [];
      for (let i = 0; i < 9; i++) {
        const raw = rawPanels[i];
        if (raw) {
          built.push({
            index: i,
            viewAngle: String(raw.viewAngle || CHARACTER_TURNAROUND_LAYOUT.defaultPanels[i].viewAngle).trim(),
            shotSize: String(raw.shotSize || CHARACTER_TURNAROUND_LAYOUT.defaultPanels[i].shotSize).trim(),
            description: String(raw.description || '').trim(),
          });
        } else {
          built.push({
            ...CHARACTER_TURNAROUND_LAYOUT.defaultPanels[i],
            description: `${character.visualPrompt || character.name}, ${CHARACTER_TURNAROUND_LAYOUT.defaultPanels[i].viewAngle} view, ${CHARACTER_TURNAROUND_LAYOUT.defaultPanels[i].shotSize}`,
          });
        }
      }
      return built;
    };

    const validatePanels = (items: CharacterTurnaroundPanel[]): string | null => {
      if (items.length !== 9) return `panels 数量错误（${items.length}）`;
      for (const p of items) {
        if (!p.viewAngle || !p.shotSize || !p.description) {
          return `panel ${p.index} 字段缺失`;
        }
        const words = countEnglishWords(p.description);
        if (words < 10 || words > 30) {
          return `panel ${p.index} description 词数为 ${words}，要求 10-30`;
        }
      }
      return null;
    };

    const responseText = await retryOperation(
      () => chatCompletion(prompt, model, 0.4, 4096, 'json_object', 600000, abortSignal),
      3,
      2000,
      abortSignal
    );
    let parsed = JSON.parse(cleanJsonString(responseText));
    let panels = buildPanels(parsed);
    let validationError = validatePanels(panels);

    if (validationError) {
      const repairPrompt = `${prompt}

Your previous output failed validation (${validationError}).
Rewrite and output JSON again with these strict rules:
1) panels must be exactly 9 items (index 0-8 in order)
2) each panel must include non-empty viewAngle, shotSize, description
3) each description must be ONE English sentence, 10-30 words
4) output JSON only, no explanation`;
      const repairedText = await retryOperation(() => chatCompletion(repairPrompt, model, 0.3, 4096, 'json_object'));
      parsed = JSON.parse(cleanJsonString(repairedText));
      panels = buildPanels(parsed);
      validationError = validatePanels(panels);
      if (validationError) {
        throw new Error(`角色九宫格视角描述校验失败：${validationError}`);
      }
    }

    console.log(`✅ 角色 ${character.name} 九宫格造型视角描述生成完成`);
    logScriptProgress(`角色「${character.name}」九宫格视角描述生成完成`);
    return panels;
  } catch (error: any) {
    console.error(`❌ 角色 ${character.name} 九宫格视角描述生成失败:`, error);
    logScriptProgress(`角色「${character.name}」九宫格视角描述生成失败`);
    throw error;
  }
};

/**
 * 生成角色九宫格造型图片
 * 将9个视角描述合成为一张3x3九宫格图片
 */
export const generateCharacterTurnaroundImage = async (
  character: Character,
  panels: CharacterTurnaroundPanel[],
  visualStyle: string,
  referenceImage?: string,
  artDirection?: ArtDirection
): Promise<string> => {
  console.log(`🖼️ generateCharacterTurnaroundImage - 为角色 ${character.name} 生成九宫格造型图片`);
  logScriptProgress(`正在为角色「${character.name}」生成九宫格造型图片...`);

  const stylePrompt = getStylePrompt(visualStyle);
  const characterSummary = character.visualPrompt || `${character.gender}, ${character.age}, ${character.personality}`;

  // 构建九宫格图片生成提示词
  const panelDescriptions = panels.map((p, idx) => {
    const position = CHARACTER_TURNAROUND_LAYOUT.positionLabels[idx];
    return `Panel ${idx + 1} (${position}): [${p.viewAngle} / ${p.shotSize}] - ${p.description}`;
  }).join('\n');

  const artDirectionSuffix = artDirection
    ? `\nArt Direction: ${artDirection.consistencyAnchors}\nLighting: ${artDirection.lightingStyle}\nTexture: ${artDirection.textureStyle}`
    : '';

  const prompt = `Create ONE character turnaround/reference sheet in a 3x3 grid (9 equal panels with thin white separators).
All panels must show the SAME character; only view angle and camera distance change.

Visual Style: ${visualStyle} (${stylePrompt})
Character: ${character.name} - ${characterSummary}

Panels (left to right, top to bottom):
${panelDescriptions}

Constraints:
- Output one single 3x3 grid image only
- Keep face, hair, body, clothing, and accessories consistent across all panels
- Keep lighting/color style consistent and use a clean neutral background
- Each panel should be clear, reference-quality, and well composed${artDirectionSuffix}

Top priority: the character must look like the same person in all 9 panels.`;

  // 收集参考图片
  const referenceImages: string[] = [];
  if (referenceImage) {
    referenceImages.push(referenceImage);
  } else if (character.referenceImage) {
    referenceImages.push(character.referenceImage);
  }

  try {
    // 优先使用 1:1 生成九宫格；若当前模型不支持则自动回退到支持的比例。
    const turnaroundAspectRatio = resolveTurnaroundAspectRatio();
    const imageUrl = await generateImage(
      prompt,
      referenceImages,
      turnaroundAspectRatio,
      false,
      false,
      '',
      { referencePackType: 'character' }
    );
    console.log(`✅ 角色 ${character.name} 九宫格造型图片生成完成`);
    logScriptProgress(`角色「${character.name}」九宫格造型图片生成完成`);
    return imageUrl;
  } catch (error: any) {
    console.error(`❌ 角色 ${character.name} 九宫格造型图片生成失败:`, error);
    logScriptProgress(`角色「${character.name}」九宫格造型图片生成失败`);
    throw error;
  }
};

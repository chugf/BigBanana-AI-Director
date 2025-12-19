import { ScriptData, Shot, Character, Scene } from "../types";
import { addRenderLogWithTokens } from './renderLogService';

// Custom error class for API Key issues
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

// Module-level variable to store the key at runtime
let runtimeApiKey: string = process.env.API_KEY || "";

/**
 * 设置全局API密钥
 * @param key - API密钥字符串
 */
export const setGlobalApiKey = (key: string) => {
  runtimeApiKey = key;
};

/**
 * 检查API密钥是否可用
 * @returns 返回运行时API密钥
 * @throws {ApiKeyError} 如果API密钥缺失则抛出错误
 */
const checkApiKey = () => {
  if (!runtimeApiKey) throw new ApiKeyError("API Key missing. Please configure your antsk API Key.");
  return runtimeApiKey;
};

// antsk API base URL
const ANTSK_API_BASE = 'https://api.antsk.cn';

/**
 * Verify API Key connectivity
 * Uses a minimal API call to test if the key is valid
 * @param key - API key to verify
 * @returns Promise<boolean> - true if key is valid, false otherwise
 */
export const verifyApiKey = async (key: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${ANTSK_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-41',
        messages: [{ role: 'user', content: '仅返回1' }],
        temperature: 0.1,
        max_tokens: 5
      })
    });

    if (!response.ok) {
      let errorMessage = `验证失败: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // ignore
      }
      return { success: false, message: errorMessage };
    }

    const data = await response.json();
    // Check if we got a valid response
    if (data.choices?.[0]?.message?.content !== undefined) {
      return { success: true, message: 'API Key 验证成功' };
    } else {
      return { success: false, message: '返回格式异常' };
    }
  } catch (error: any) {
    return { success: false, message: error.message || '网络错误' };
  }
};

/**
 * 重试操作辅助函数，用于处理429限流错误
 * @param operation - 要执行的异步操作函数
 * @param maxRetries - 最大重试次数，默认3次
 * @param baseDelay - 基础延迟时间（毫秒），默认2000ms，采用指数退避策略
 * @returns 返回操作结果
 * @throws 如果所有重试都失败，则抛出最后一次的错误
 */
const retryOperation = async <T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 2000): Promise<T> => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      // Check for quota/rate limit errors (429)
      if (e.status === 429 || e.code === 429 || e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('RESOURCE_EXHAUSTED')) {
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`Hit rate limit, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw e; // Throw other errors immediately
    }
  }
  throw lastError;
};

/**
 * 清理JSON字符串，移除Markdown代码块标记
 * @param str - 原始字符串
 * @returns 清理后的JSON字符串
 */
const cleanJsonString = (str: string): string => {
  if (!str) return "{}";
  // Remove ```json ... ``` or ``` ... ```
  let cleaned = str.replace(/```json\n?/g, '').replace(/```/g, '');
  return cleaned.trim();
};

/**
 * 调用antsk聊天完成API
 * @param prompt - 提示词内容
 * @param model - 使用的模型名称，默认'gpt-5.1'
 * @param temperature - 温度参数，控制随机性，默认0.7
 * @param maxTokens - 最大生成token数，默认8192
 * @returns 返回AI生成的文本内容
 * @throws 如果API调用失败则抛出错误
 */
const chatCompletion = async (prompt: string, model: string = 'gpt-5.1', temperature: number = 0.7, maxTokens: number = 8192): Promise<string> => {
  const apiKey = checkApiKey();
  
  // console.log('🌐 API请求 - 模型:', model, '| 温度:', temperature);
  
  const response = await fetch(`${ANTSK_API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    let errorMessage = `HTTP错误: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {
      const errorText = await response.text();
      if (errorText) errorMessage = errorText;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};

/**
 * Agent 1 & 2: Script Structuring & Breakdown
 * Uses antsk chat completion for fast, structured text generation.
 */
export const parseScriptToData = async (rawText: string, language: string = '中文', model: string = 'gpt-5.1', visualStyle: string = 'live-action'): Promise<ScriptData> => {
  console.log('📝 parseScriptToData 调用 - 使用模型:', model, '视觉风格:', visualStyle);
  const startTime = Date.now();
  
  const prompt = `
    Analyze the text and output a JSON object in the language: ${language}.
    
    Tasks:
    1. Extract title, genre, logline (in ${language}).
    2. Extract characters (id, name, gender, age, personality).
    3. Extract scenes (id, location, time, atmosphere).
    4. Break down the story into paragraphs linked to scenes.
    
    Input:
    "${rawText.slice(0, 30000)}" // Limit input context if needed
    
    Output ONLY valid JSON with this structure:
    {
      "title": "string",
      "genre": "string",
      "logline": "string",
      "characters": [{"id": "string", "name": "string", "gender": "string", "age": "string", "personality": "string"}],
      "scenes": [{"id": "string", "location": "string", "time": "string", "atmosphere": "string"}],
      "storyParagraphs": [{"id": number, "text": "string", "sceneRefId": "string"}]
    }
  `;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192));

  let parsed: any = {};
  try {
    const text = cleanJsonString(responseText);
    parsed = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse script data JSON:", e);
    parsed = {};
  }
  
  // Enforce String IDs for consistency and init variations
  const characters = Array.isArray(parsed.characters) ? parsed.characters.map((c: any) => ({
    ...c, 
    id: String(c.id),
    variations: [] // Initialize empty variations
  })) : [];
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes.map((s: any) => ({...s, id: String(s.id)})) : [];
  const storyParagraphs = Array.isArray(parsed.storyParagraphs) ? parsed.storyParagraphs.map((p: any) => ({...p, sceneRefId: String(p.sceneRefId)})) : [];

  const genre = parsed.genre || "通用";

  // Generate visual prompts for characters and scenes
  console.log("🎨 正在为角色和场景生成视觉提示词...", `风格: ${visualStyle}`);
  
  // Generate character visual prompts
  for (let i = 0; i < characters.length; i++) {
    try {
      // Add delay to avoid rate limits (1.5s between requests)
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log(`  生成角色提示词: ${characters[i].name}`);
      characters[i].visualPrompt = await generateVisualPrompts('character', characters[i], genre, model, visualStyle, language);
    } catch (e) {
      console.error(`Failed to generate visual prompt for character ${characters[i].name}:`, e);
      // Continue with other characters even if one fails
    }
  }

  // Generate scene visual prompts
  for (let i = 0; i < scenes.length; i++) {
    try {
      // Add delay to avoid rate limits
      if (i > 0 || characters.length > 0) await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log(`  生成场景提示词: ${scenes[i].location}`);
      scenes[i].visualPrompt = await generateVisualPrompts('scene', scenes[i], genre, model, visualStyle, language);
    } catch (e) {
      console.error(`Failed to generate visual prompt for scene ${scenes[i].location}:`, e);
      // Continue with other scenes even if one fails
    }
  }

  console.log("✅ 视觉提示词生成完成！");

  const result = {
    title: parsed.title || "未命名剧本",
    genre: genre,
    logline: parsed.logline || "",
    language: language,
    characters,
    scenes,
    storyParagraphs
  };

  // Log successful script parsing
  addRenderLogWithTokens({
    type: 'script-parsing',
    resourceId: 'script-parse-' + Date.now(),
    resourceName: result.title,
    status: 'success',
    model: model,
    prompt: prompt.substring(0, 200) + '...',
    duration: Date.now() - startTime
  });

  return result;
  } catch (error: any) {
    // Log failed script parsing
    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'script-parse-' + Date.now(),
      resourceName: '剧本解析',
      status: 'failed',
      model: model,
      prompt: prompt.substring(0, 200) + '...',
      error: error.message,
      duration: Date.now() - startTime
    });
    throw error;
  }
};

/**
 * 生成分镜列表
 * 根据剧本数据和目标时长，为每个场景生成适量的分镜头
 * 算法：目标时长(秒) ÷ 10秒/镜头 = 总镜头数，然后平均分配到各场景
 * @param scriptData - 剧本数据，包含场景、角色、目标时长等信息
 * @param model - 使用的AI模型，默认'gpt-5.1'
 * @returns 返回分镜头列表，每个镜头包含关键帧、镜头运动等信息
 */
export const generateShotList = async (scriptData: ScriptData, model: string = 'gpt-5.1'): Promise<Shot[]> => {
  console.log('🎬 generateShotList 调用 - 使用模型:', model, '视觉风格:', scriptData.visualStyle);
  const overallStartTime = Date.now();
  
  if (!scriptData.scenes || scriptData.scenes.length === 0) {
    return [];
  }

  const lang = scriptData.language || '中文';
  const visualStyle = scriptData.visualStyle || 'live-action';
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  
  // Helper to process a single scene
  // We process per-scene to avoid token limits and parsing errors with large JSONs
  const processScene = async (scene: Scene, index: number): Promise<Shot[]> => {
    const sceneStartTime = Date.now();
    const paragraphs = scriptData.storyParagraphs
      .filter(p => String(p.sceneRefId) === String(scene.id))
      .map(p => p.text)
      .join('\n');

    if (!paragraphs.trim()) return [];

    // Calculate expected number of shots based on target duration
    // Each shot = 10 seconds of video, so target duration / 10 = total shots needed
    const targetDurationStr = scriptData.targetDuration || '60s';
    const targetSeconds = parseInt(targetDurationStr.replace(/[^\d]/g, '')) || 60;
    const totalShotsNeeded = Math.round(targetSeconds / 10);
    const scenesCount = scriptData.scenes.length;
    const shotsPerScene = Math.max(1, Math.round(totalShotsNeeded / scenesCount));
    
    const prompt = `
      Act as a professional cinematographer. Generate a detailed shot list (Camera blocking) for Scene ${index + 1}.
      Language for Text Output: ${lang}.
      
      IMPORTANT VISUAL STYLE: ${stylePrompt}
      All 'visualPrompt' fields MUST describe shots in this "${visualStyle}" style.
      
      Scene Details:
      Location: ${scene.location}
      Time: ${scene.time}
      Atmosphere: ${scene.atmosphere}
      
      Scene Action:
      "${paragraphs.slice(0, 5000)}"
      
      Context:
      Genre: ${scriptData.genre}
      Visual Style: ${visualStyle} (${stylePrompt})
      Target Duration (Whole Script): ${scriptData.targetDuration || 'Standard'}
      Total Shots Budget: ${totalShotsNeeded} shots (Each shot = 10 seconds of video)
      Shots for This Scene: Approximately ${shotsPerScene} shots
      
      Characters:
      ${JSON.stringify(scriptData.characters.map(c => ({ id: c.id, name: c.name, desc: c.visualPrompt || c.personality })))}

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
      1. Create EXACTLY ${shotsPerScene} shots (or ${shotsPerScene - 1} to ${shotsPerScene + 1} shots if needed for story flow) for this scene.
      2. CRITICAL: Each shot will be 10 seconds. Total shots must match the target duration formula: ${targetSeconds} seconds ÷ 10 = ${totalShotsNeeded} total shots across all scenes.
      3. DO NOT exceed ${shotsPerScene + 1} shots for this scene. Select the most important moments only.
      4. 'cameraMovement': Can reference the Professional Camera Movement Reference list above for inspiration, or use your own creative camera movements. You may use the exact English terms (e.g., "Dolly Shot", "Pan Right Shot", "Zoom In Shot", "Tracking Shot") or describe custom movements.
      5. 'shotSize': Specify the field of view (e.g., Extreme Close-up, Medium Shot, Wide Shot).
      6. 'actionSummary': Detailed description of what happens in the shot (in ${lang}).
      7. 'visualPrompt': Detailed description for image generation in ${visualStyle} style (OUTPUT IN ${lang}). Include style-specific keywords. Keep it under 50 words.
      
      Output ONLY a valid JSON array like:
      [
        {
          "id": "string",
          "sceneId": "${scene.id}",
          "actionSummary": "string",
          "dialogue": "string (empty if none)",
          "cameraMovement": "string",
          "shotSize": "string",
          "characters": ["string"],
          "keyframes": [
            {"id": "string", "type": "start|end", "visualPrompt": "string (MUST include ${visualStyle} style keywords)"}
          ]
        }
      ]
    `;

    try {
      console.log(`  📡 场景 ${index + 1} API调用 - 模型:`, model);
      const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192));
      const text = cleanJsonString(responseText);
      const shots = JSON.parse(text);
      
      // FIX: Explicitly override the sceneId to match the source scene
      // This prevents the AI from hallucinating incorrect scene IDs
      const validShots = Array.isArray(shots) ? shots : [];
      const result = validShots.map(s => ({
        ...s,
        sceneId: String(scene.id) // Force String
      }));
      
      // Log successful shot generation for this scene
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
      
      // Log failed shot generation for this scene
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
      
      return [];
    }
  };

  // Process scenes sequentially (Batch Size 1) to strictly minimize rate limits
  const BATCH_SIZE = 1;
  const allShots: Shot[] = [];
  
  for (let i = 0; i < scriptData.scenes.length; i += BATCH_SIZE) {
    // Add delay between batches
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));
    
    const batch = scriptData.scenes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((scene, idx) => processScene(scene, i + idx))
    );
    batchResults.forEach(shots => allShots.push(...shots));
  }

  // Re-index shots to be sequential globally and set initial status
  return allShots.map((s, idx) => ({
    ...s,
    id: `shot-${idx + 1}`,
    keyframes: Array.isArray(s.keyframes) ? s.keyframes.map(k => ({ 
      ...k, 
      id: `kf-${idx + 1}-${k.type}`, // Normalized ID
      status: 'pending' 
    })) : []
  }));
};

/**
 * Agent 3: Visual Design (Prompt Generation)
 * Now includes visual style parameter for different rendering styles
 */
const VISUAL_STYLE_PROMPTS: { [key: string]: string } = {
  'live-action': 'photorealistic, cinematic film quality, real human actors, professional cinematography, natural lighting, 8K resolution',
  'anime': 'Japanese anime style, cel-shaded, vibrant colors, expressive eyes, dynamic poses, Studio Ghibli/Makoto Shinkai quality',
  '2d-animation': 'classic 2D animation, hand-drawn style, Disney/Pixar quality, smooth lines, expressive characters, painterly backgrounds',
  '3d-animation': 'high-quality 3D CGI animation, Pixar/DreamWorks style, subsurface scattering, detailed textures, stylized characters',
  'cyberpunk': 'cyberpunk aesthetic, neon-lit, rain-soaked streets, holographic displays, high-tech low-life, Blade Runner style',
  'oil-painting': 'oil painting style, visible brushstrokes, rich textures, classical art composition, museum quality fine art',
};

/**
 * 生成角色或场景的视觉提示词
 * 根据指定的视觉风格和语言，为角色或场景生成详细的视觉描述
 * @param type - 类型，'character'（角色）或'scene'（场景）
 * @param data - 角色或场景的数据
 * @param genre - 剧本类型/题材
 * @param model - 使用的AI模型，默认'gpt-5.1'
 * @param visualStyle - 视觉风格，如'live-action'、'anime'等，默认'live-action'
 * @param language - 输出语言，默认'中文'
 * @returns 返回指定语言的视觉提示词，用于图像生成
 */
export const generateVisualPrompts = async (type: 'character' | 'scene', data: Character | Scene, genre: string, model: string = 'gpt-5.1', visualStyle: string = 'live-action', language: string = '中文'): Promise<string> => {
   // Get style-specific prompt additions
   const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
   
   const prompt = `Generate a high-fidelity visual prompt for a ${type} in a ${genre} production.
   
   IMPORTANT: The visual style MUST be: ${stylePrompt}
   
   ${type === 'character' ? 'For characters: describe their appearance, clothing, pose, expression in this style.' : 'For scenes: describe the environment, lighting, atmosphere in this style.'}
   
   Data: ${JSON.stringify(data)}
   
   Output only the prompt in ${language}, comma-separated, focused on visual details specific to the "${visualStyle}" style.
   Make sure to emphasize the ${visualStyle} rendering style throughout the prompt.`;

   return await retryOperation(() => chatCompletion(prompt, model, 0.7, 1024));
};

/**
 * 生成图像（Agent 4 & 6）
 * 使用antsk图像生成API (gemini-3-pro-image-preview)
 * 支持参考图像，确保角色和场景的一致性
 * @param prompt - 图像生成提示词
 * @param referenceImages - 参考图像数组（base64格式），第一张为场景参考，后续为角色参考
 * @returns 返回生成的图像base64字符串
 * @throws 如果图像生成失败则抛出错误
 */
export const generateImage = async (prompt: string, referenceImages: string[] = []): Promise<string> => {
  const apiKey = checkApiKey();
  const startTime = Date.now();

  try {
    // If we have reference images, instruct the model to use them for consistency
    let finalPrompt = prompt;
    if (referenceImages.length > 0) {
      finalPrompt = `
      Reference Images Information:
      - The FIRST image provided is the Scene/Environment reference.
      - Any subsequent images are Character references (e.g. Base Look, or specific Variation).
      
      Task:
      Generate a cinematic shot matching this prompt: "${prompt}".
      
      Requirements:
      - STRICTLY maintain the visual style, lighting, and environment from the scene reference.
      - If characters are present, they MUST resemble the character reference images provided.
    `;
    }

  const parts: any[] = [{ text: finalPrompt }];

  // Attach reference images as inline data
  referenceImages.forEach((imgUrl) => {
    // Parse the data URL to get mimeType and base64 data
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

  const response = await retryOperation(async () => {
    const res = await fetch(`${ANTSK_API_BASE}/v1beta/models/gemini-3-pro-image-preview:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': '*/*'
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: parts
        }]
      })
    });

    if (!res.ok) {
      let errorMessage = `HTTP错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  });

  // Extract base64 image
  const candidates = response.candidates || [];
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        const result = `data:image/png;base64,${part.inlineData.data}`;
        
        // Log successful generation
        addRenderLogWithTokens({
          type: 'keyframe',
          resourceId: 'image-' + Date.now(),
          resourceName: prompt.substring(0, 50) + '...',
          status: 'success',
          model: 'imagen-3',
          prompt: prompt,
          duration: Date.now() - startTime
        });
        
        return result;
      }
    }
  }
  
  throw new Error("图片生成失败 (No image data returned)");
  } catch (error: any) {
    // Log failed generation
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'image-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: 'imagen-3',
      prompt: prompt,
      error: error.message,
      duration: Date.now() - startTime
    });
    
    throw error;
  }
};

/**
 * 将视频URL转换为base64格式
 * @param url - 视频文件的URL
 * @returns 返回base64编码的视频数据
 * @throws 如果下载或转换失败则抛出错误
 */
const convertVideoUrlToBase64 = async (url: string): Promise<string> => {
  try {
    // 下载视频文件
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载视频失败: HTTP ${response.status}`);
    }
    
    // 获取视频blob
    const blob = await response.blob();
    
    // 转换为base64
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.onerror = () => {
        reject(new Error('转换视频为base64失败'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error: any) {
    console.error('视频URL转base64失败:', error);
    throw new Error(`视频转换失败: ${error.message}`);
  }
};

/**
 * 生成视频(Agent 8)
 * 使用antsk流式视频生成API (veo_3_1_i2v_s_fast_fl_landscape 或 sora-2)
 * 通过起始帧和结束帧生成10秒视频片段
 * @param prompt - 视频生成提示词
 * @param startImageBase64 - 起始关键帧图像(base64格式)
 * @param endImageBase64 - 结束关键帧图像(base64格式)
 * @param model - 使用的视频生成模型,默认'veo_3_1_i2v_s_fast_fl_landscape'
 * @returns 返回生成的视频base64编码(而非URL),用于存储到indexedDB
 * @throws 如果视频生成失败则抛出错误
 * @note 视频URL会过期,因此转换为base64存储
 */
export const generateVideo = async (prompt: string, startImageBase64?: string, endImageBase64?: string, model: string = 'veo_3_1_i2v_s_fast_fl_landscape'): Promise<string> => {
  const apiKey = checkApiKey();
  
  // Clean base64 strings
  const cleanStart = startImageBase64?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';
  const cleanEnd = endImageBase64?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';

  // Build request body based on model requirements
  const messages: any[] = [
    { role: 'user', content: prompt }
  ];

  // Add images as content if provided
  if (cleanStart) {
    messages[0].content = [
      { type: 'text', text: prompt },
      { 
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${cleanStart}` }
      }
    ];
  }

  if (cleanEnd) {
    if (Array.isArray(messages[0].content)) {
      messages[0].content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${cleanEnd}` }
      });
    }
  }

  // Use streaming to handle long video generation
  const response = await retryOperation(async () => {
    const res = await fetch(`${ANTSK_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.7
      })
    });

    if (!res.ok) {
      let errorMessage = `HTTP错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return res;
  });

  // Parse streaming response
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let videoUrl = '';
  let buffer = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            
            // Look for video URL in the content
            const urlMatch = content.match(/(https?:\/\/[^\s]+\.mp4)/);
            if (urlMatch) {
              videoUrl = urlMatch[1];
              break;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
      
      if (videoUrl) break;
    }
  }

  if (!videoUrl) {
    throw new Error("视频生成失败 (No video URL returned)");
  }

  console.log('🎬 视频URL获取成功,正在转换为base64...');
  
  // 将视频URL转换为base64,避免URL过期问题
  try {
    const videoBase64 = await convertVideoUrlToBase64(videoUrl);
    console.log('✅ 视频已转换为base64格式,可安全存储到IndexedDB');
    return videoBase64;
  } catch (error: any) {
    console.error('❌ 视频转base64失败,返回原始URL:', error);
    // 如果转换失败,返回原始URL作为降级方案
    return videoUrl;
  }
};

/**
 * AI续写功能 - 基于已有剧本内容续写后续情节
 * @param existingScript - 已有的剧本内容
 * @param language - 输出语言
 * @param model - 使用的AI模型
 * @returns 续写的内容
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
 * AI改写功能 - 对整个剧本进行改写，让情节更连贯
 * @param originalScript - 原始剧本内容
 * @param language - 输出语言
 * @param model - 使用的AI模型
 * @returns 改写后的完整剧本
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

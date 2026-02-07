export interface CharacterVariation {
  id: string;
  name: string; // e.g., "Casual", "Tactical Gear", "Injured"
  visualPrompt: string;
  negativePrompt?: string; // 负面提示词，用于排除不想要的元素
  referenceImage?: string; // 角色变体参考图，存储为base64格式（data:image/png;base64,...）
  status?: 'pending' | 'generating' | 'completed' | 'failed'; // 生成状态，用于loading状态持久化
}

export interface Character {
  id: string;
  name: string;
  gender: string;
  age: string;
  personality: string;
  visualPrompt?: string;
  negativePrompt?: string; // 负面提示词，用于排除不想要的元素
  coreFeatures?: string; // 核心固定特征，用于保持角色一致性
  referenceImage?: string; // 角色基础参考图，存储为base64格式（data:image/png;base64,...）
  variations: CharacterVariation[]; // Added: List of alternative looks
  status?: 'pending' | 'generating' | 'completed' | 'failed'; // 生成状态，用于loading状态持久化
}

export interface Scene {
  id: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  negativePrompt?: string; // 负面提示词，用于排除不想要的元素
  referenceImage?: string; // 场景参考图，存储为base64格式（data:image/png;base64,...）
  status?: 'pending' | 'generating' | 'completed' | 'failed'; // 生成状态，用于loading状态持久化
}

export type AssetLibraryItemType = 'character' | 'scene';

export interface AssetLibraryItem {
  id: string;
  type: AssetLibraryItemType;
  name: string;
  projectId?: string;
  projectName?: string;
  createdAt: number;
  updatedAt: number;
  data: Character | Scene;
}

export interface Keyframe {
  id: string;
  type: 'start' | 'end';
  visualPrompt: string;
  imageUrl?: string; // 关键帧图像，存储为base64格式（data:image/png;base64,...）
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface VideoInterval {
  id: string;
  startKeyframeId: string;
  endKeyframeId: string;
  duration: number;
  motionStrength: number;
  videoUrl?: string; // 视频数据，存储为base64格式（data:video/mp4;base64,...），避免URL过期问题
  videoPrompt?: string; // 视频生成时使用的提示词
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

/**
 * 九宫格分镜预览 - 单个面板数据
 */
export interface NineGridPanel {
  index: number;           // 0-8, 九宫格位置索引
  shotSize: string;        // 景别：特写/近景/中景/全景/远景 等
  cameraAngle: string;     // 机位角度：俯拍/仰拍/平视/斜拍 等
  description: string;     // 该格子的视觉描述
}

/**
 * 九宫格分镜预览数据
 */
export interface NineGridData {
  panels: NineGridPanel[];  // 9个格子的描述数据
  imageUrl?: string;        // 生成的九宫格图片 (base64)
  prompt?: string;          // 生成时使用的完整提示词
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface Shot {
  id: string;
  sceneId: string;
  actionSummary: string;
  dialogue?: string; 
  cameraMovement: string;
  shotSize?: string; 
  characters: string[]; // Character IDs
  characterVariations?: { [characterId: string]: string }; // Added: Map char ID to variation ID for this shot
  keyframes: Keyframe[];
  interval?: VideoInterval;
  videoModel?: 'veo' | 'veo-r2v' | 'sora-2' | 'veo_3_1_t2v_fast_landscape' | 'veo_3_1_t2v_fast_portrait' | 'veo_3_1_i2v_s_fast_fl_landscape' | 'veo_3_1_i2v_s_fast_fl_portrait'; // Video generation model selection
  nineGrid?: NineGridData; // 可选的九宫格分镜预览数据（高级功能）
}

export interface ScriptData {
  title: string;
  genre: string;
  logline: string;
  targetDuration?: string;
  language?: string;
  visualStyle?: string; // Visual style: live-action, anime, 3d-animation, etc.
  shotGenerationModel?: string; // Model used for shot generation
  characters: Character[];
  scenes: Scene[];
  storyParagraphs: { id: number; text: string; sceneRefId: string }[];
}

export interface RenderLog {
  id: string;
  timestamp: number; // Unix timestamp when API was called
  type: 'character' | 'character-variation' | 'scene' | 'keyframe' | 'video' | 'script-parsing';
  resourceId: string; // ID of the resource being generated
  resourceName: string; // Human-readable name
  status: 'success' | 'failed';
  model: string; // Model used (e.g., 'imagen-3', 'veo_3_1_i2v_s_fast_fl_landscape', 'gpt-41')
  prompt?: string; // The prompt used (optional, for debugging)
  error?: string; // Error message if failed
  inputTokens?: number; // Input tokens consumed
  outputTokens?: number; // Output tokens generated
  totalTokens?: number; // Total tokens (if available from API)
  duration?: number; // Time taken in milliseconds
}

export interface ProjectState {
  id: string;
  title: string;
  createdAt: number;
  lastModified: number;
  stage: 'script' | 'assets' | 'director' | 'export' | 'prompts';
  
  // Script Phase Data
  rawScript: string;
  targetDuration: string;
  language: string;
  visualStyle: string; // Visual style: live-action, anime, 3d-animation, etc.
  shotGenerationModel: string; // Model for shot generation
  
  scriptData: ScriptData | null;
  shots: Shot[];
  isParsingScript: boolean;
  renderLogs: RenderLog[]; // History of all API calls for this project
}

// ============================================
// 模型管理相关类型定义
// ============================================

/**
 * 横竖屏比例类型
 * - 16:9: 横屏（默认）
 * - 9:16: 竖屏
 * - 1:1: 方形
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * 视频时长类型（仅 Sora-2 支持）
 */
export type VideoDuration = 4 | 8 | 12;

/**
 * 模型提供商配置
 */
export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;  // API 基础 URL，如 'https://api.antsk.cn'
  apiKey?: string;  // 可选的独立 API Key（如果不设置则使用全局 API Key）
  isDefault?: boolean;  // 是否为默认提供商
  isBuiltIn?: boolean;  // 是否为内置提供商（不可删除）
}

/**
 * 对话模型配置
 */
export interface ChatModelConfig {
  providerId: string;
  modelName: string;  // 如 'gpt-5.1', 'gpt-41', 'gpt-5.2'
  endpoint?: string;  // API 端点，默认为 '/v1/chat/completions'
}

/**
 * 画图模型配置
 */
export interface ImageModelConfig {
  providerId: string;
  modelName: string;  // 如 'gemini-3-pro-image-preview'
  endpoint?: string;  // API 端点，默认为 '/v1beta/models/{modelName}:generateContent'
}

/**
 * 视频模型配置
 */
export interface VideoModelConfig {
  providerId: string;
  type: 'sora' | 'veo';  // sora 使用异步 API，veo 使用同步 API
  modelName: string;  // 基础模型名，如 'sora-2', 'veo_3_1'
  endpoint?: string;  // API 端点
}

/**
 * 完整的模型配置
 */
export interface ModelConfig {
  chatModel: ChatModelConfig;
  imageModel: ImageModelConfig;
  videoModel: VideoModelConfig;
}

/**
 * 模型管理全局状态
 */
export interface ModelManagerState {
  providers: ModelProvider[];
  currentConfig: ModelConfig;
  defaultAspectRatio: AspectRatio;
  defaultVideoDuration: VideoDuration;
}

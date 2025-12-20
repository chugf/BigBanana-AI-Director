/**
 * StagePrompts 配置常量
 */

export const STYLES = {
  card: {
    base: 'bg-zinc-900/50 border border-zinc-800 rounded-lg p-4',
    nested: 'bg-zinc-950/50 border border-zinc-800/50 rounded p-3'
  },
  button: {
    edit: 'text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1 border border-indigo-500/30 rounded hover:bg-indigo-500/10 transition-colors',
    editSmall: 'text-xs text-indigo-400 hover:text-indigo-300 px-2 py-0.5 border border-indigo-500/30 rounded hover:bg-indigo-500/10 transition-colors',
    editVideo: 'text-xs text-purple-400 hover:text-purple-300 px-2 py-0.5 border border-purple-500/30 rounded hover:bg-purple-500/10 transition-colors',
    save: 'flex items-center gap-1 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded transition-colors',
    saveSmall: 'flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded transition-colors',
    saveVideo: 'flex items-center gap-1 px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white text-xs rounded transition-colors',
    cancel: 'flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors',
    cancelSmall: 'flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors'
  },
  textarea: {
    base: 'w-full bg-zinc-800 text-white rounded border border-zinc-700 focus:border-indigo-500 focus:outline-none font-mono',
    large: 'p-3 min-h-[100px] text-sm',
    small: 'p-2 min-h-[80px] text-xs',
    video: 'p-2 min-h-[120px] text-xs'
  },
  display: {
    base: 'text-sm text-zinc-400 bg-zinc-950/50 p-3 rounded border border-zinc-800 font-mono',
    small: 'text-xs text-zinc-400 font-mono whitespace-pre-wrap'
  },
  badge: {
    shotNumber: 'text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded',
    keyframeStart: 'text-xs font-medium px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30',
    keyframeEnd: 'text-xs font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30',
    videoPrompt: 'text-xs font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30'
  }
};

export type PromptCategory = 'characters' | 'scenes' | 'keyframes' | 'all';

export type EditingPrompt = {
  type: 'character' | 'character-variation' | 'scene' | 'keyframe' | 'video';
  id: string;
  variationId?: string;
  shotId?: string;
  value: string;
} | null;

export const STATUS_STYLES = {
  completed: 'text-green-400 bg-green-500/10',
  generating: 'text-yellow-400 bg-yellow-500/10',
  failed: 'text-red-400 bg-red-500/10',
  idle: 'text-zinc-500'
};

export const STATUS_LABELS = {
  completed: '✓ 已生成',
  generating: '生成中',
  failed: '失败',
  idle: '待生成'
};

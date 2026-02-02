// Onboarding 常量配置

export const ONBOARDING_STORAGE_KEY = 'bigbanana_onboarding_completed';

export const ONBOARDING_PAGES = {
  WELCOME: 0,
  WORKFLOW: 1,
  HIGHLIGHTS: 2,
  ACTION: 3,
} as const;

export const TOTAL_PAGES = 4;

// 工作流步骤
export const WORKFLOW_STEPS = [
  {
    number: '①',
    title: '写剧本',
    description: 'AI自动提取角色和场景',
  },
  {
    number: '②',
    title: '定形象',
    description: '一键生成角色定妆照',
  },
  {
    number: '③',
    title: '排分镜',
    description: '关键帧驱动视频生成',
  },
  {
    number: '④',
    title: '导成片',
    description: '合并导出完整短剧',
  },
] as const;

// 核心亮点
export const HIGHLIGHTS = [
  {
    icon: '🎬',
    title: '首尾帧锁定',
    description: '上一镜的结尾，就是下一镜的开头',
  },
  {
    icon: '👔',
    title: '角色衣橱',
    description: '同一角色，多套造型随时切换',
  },
  {
    icon: '🎨',
    title: '风格统一',
    description: '真人、动漫、3D任选，全片一致',
  },
] as const;

// 快速开始选项
export const QUICK_START_OPTIONS = [
  {
    id: 'script',
    icon: '📝',
    title: '从剧本开始',
    description: '粘贴你的故事，AI帮你拆分镜',
  },
  {
    id: 'example',
    icon: '🎬',
    title: '看看示例项目',
    description: '先逛逛别人怎么做的',
  },
] as const;

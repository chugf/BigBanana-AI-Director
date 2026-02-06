// UI样式常量
export const STYLES = {
  // 容器样式
  mainContainer: "flex flex-col h-full bg-[var(--bg-secondary)] relative overflow-hidden",
  toolbar: "h-16 border-b border-[var(--border-primary)] bg-[var(--bg-elevated)] px-6 flex items-center justify-between shrink-0",
  workbench: "w-[480px] bg-[var(--bg-deep)] flex flex-col h-full shadow-2xl animate-in slide-in-from-right-10 duration-300 relative z-20",
  workbenchHeader: "h-16 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0",
  workbenchContent: "flex-1 overflow-y-auto p-6 space-y-8",
  
  // 卡片样式
  card: "group relative flex flex-col bg-[var(--bg-elevated)] border rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
  cardActive: "border-[var(--accent)] ring-1 ring-[var(--accent-border)] shadow-xl scale-[0.98]",
  cardInactive: "border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:shadow-lg",
  
  // 按钮样式
  primaryButton: "px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 shadow-lg shadow-[var(--btn-primary-shadow)]",
  secondaryButton: "px-4 py-2 bg-[var(--bg-surface)] text-[var(--text-tertiary)] border border-[var(--border-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-primary)] rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2",
  iconButton: "p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors",
  
  // 模态框样式
  modalOverlay: "fixed inset-0 z-50 bg-[var(--overlay-heavy)] backdrop-blur-sm flex items-center justify-center p-4",
  modalContainer: "bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-2xl",
  modalTextarea: "w-full h-64 bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg p-4 text-sm outline-none focus:border-[var(--accent)] transition-colors resize-none",
  
  // 内容区域
  sectionHeader: "flex items-center gap-2 border-b border-[var(--border-primary)] pb-2",
  contentBox: "bg-[var(--bg-surface)] p-5 rounded-xl border border-[var(--border-primary)]",
};

// 视觉风格配置
export const VISUAL_STYLE_PROMPTS: Record<string, string> = {
  'live-action': 'photorealistic, cinematic film quality, real human actors, professional cinematography, natural lighting, 8K resolution',
  'anime': 'Japanese anime style, cel-shaded, vibrant colors, expressive eyes, dynamic poses, Studio Ghibli/Makoto Shinkai quality',
  '2d-animation': 'classic 2D animation, hand-drawn style, Disney/Pixar quality, smooth lines, expressive characters, painterly backgrounds',
  '3d-animation': 'high-quality 3D CGI animation, Pixar/DreamWorks style, subsurface scattering, detailed textures, stylized characters',
  'cyberpunk': 'cyberpunk aesthetic, neon-lit, rain-soaked streets, holographic displays, high-tech low-life, Blade Runner style',
  'oil-painting': 'oil painting style, visible brushstrokes, rich textures, classical art composition, museum quality fine art',
};

// 视频提示词模板
export const VIDEO_PROMPT_TEMPLATES = {
  sora2: {
    chinese: `从第一张图片（起始帧）到第二张图片（结束帧）生成平滑过渡的视频。

动作描述：{actionSummary}

技术要求：
- 关键：视频必须从第一张图片的精确构图开始，逐渐过渡到第二张图片的精确构图结束
- 镜头运动：{cameraMovement}
- 过渡：确保起始帧和结束帧之间自然流畅的运动，避免跳跃或不连续
- 视觉风格：电影质感，全程保持一致的光照和色调
- 细节：保持两帧之间角色和场景的连续性和一致性
- 语言：配音和字幕使用中文`,
    
    english: `Generate a smooth transition video from the first image (start frame) to the second image (end frame).

Action Description: {actionSummary}

Technical Requirements:
- CRITICAL: The video MUST begin with the exact composition of the first image and gradually transition to end with the exact composition of the second image
- Camera Movement: {cameraMovement}
- Transition: Ensure natural and fluid motion between start and end frames, avoid jumps or discontinuities
- Visual Style: Cinematic quality with consistent lighting and color tone throughout
- Details: Maintain character and scene continuity and consistency between both frames
- Language: Use {language} for voiceover and subtitles`
  },
  
  veo: {
    simple: `{actionSummary}

镜头运动：{cameraMovement}
配音语言：使用{language}配音`
  }
};

// 默认配置
export const DEFAULTS = {
  videoModel: 'sora-2' as const,
  batchGenerateDelay: 3000, // 批量生成延迟（毫秒）
};

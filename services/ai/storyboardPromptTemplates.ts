/**
 * 分镜与九宫格提示词模板（共享）
 * 供 UI 侧常量与 AI 服务侧共同复用，避免模板漂移
 */

export const NINE_GRID_SPLIT_PROMPT = {
  system: `你是专业分镜师。请把同一镜头拆成9个不重复视角，用于3x3九宫格分镜。保持同一场景与角色连续性。`,

  user: `请将以下镜头动作拆解为9个不同的摄影视角，用于生成一张3x3九宫格分镜图。

【镜头动作】{actionSummary}
【原始镜头运动】{cameraMovement}
【场景信息】地点: {location}, 时间: {time}, 氛围: {atmosphere}
【角色】{characters}
【视觉风格】{visualStyle}

输出规则（只输出JSON）：
1) 顶层为 {"panels":[...]}
2) panels 必须恰好9项，index=0-8，顺序为左到右、上到下
3) 每项含 shotSize、cameraAngle、description，均不能为空
4) shotSize/cameraAngle 用简短中文；description 用英文单句（10-30词），聚焦主体、动作、构图`
};

export const NINE_GRID_IMAGE_PROMPT_TEMPLATE = {
  prefix: `Create ONE cinematic storyboard image in a 3x3 grid (9 equal panels, thin white separators).
All panels depict the SAME scene; vary camera angle and shot size only.
Style: {visualStyle}
Panels (left-to-right, top-to-bottom):`,

  panelTemplate: `Panel {index} ({position}): [{shotSize} / {cameraAngle}] - {description}`,

  suffix: `Constraints:
- Output one single 3x3 grid image only
- Keep character identity consistent across all panels
- Keep lighting/color/mood consistent across all panels
- Each panel is a complete cinematic keyframe`
};


/**
 * 分镜与九宫格提示词模板（共享）
 * 供 UI 侧常量与 AI 服务侧共同复用，避免模板漂移
 */

export const NINE_GRID_SPLIT_PROMPT = {
  system: `你是一位专业的电影分镜师和摄影指导。你的任务是将一个镜头动作拆解为9个不同的摄影视角，用于九宫格分镜预览。
每个视角必须展示相同场景的不同景别和机位角度组合，确保覆盖从远景到特写、从俯拍到仰拍的多样化视角。`,

  user: `请将以下镜头动作拆解为9个不同的摄影视角，用于生成一张3x3九宫格分镜图。

【镜头动作】{actionSummary}
【原始镜头运动】{cameraMovement}
【场景信息】地点: {location}, 时间: {time}, 氛围: {atmosphere}
【角色】{characters}
【视觉风格】{visualStyle}

请按照以下要求返回JSON格式数据：
1. 9个视角必须覆盖不同的景别和角度组合，避免重复
2. 建议覆盖：建立镜头(远/全景)、人物交互(中景)、情绪表达(近景/特写)、氛围细节(各种角度)
3. 每个视角的description必须包含具体的画面内容描述（角色位置、动作、表情、环境细节等）
4. description使用英文撰写，但可以包含场景和角色的中文名称

请严格按照以下JSON格式输出，不要包含其他文字：
{
  "panels": [
    {
      "index": 0,
      "shotSize": "远景",
      "cameraAngle": "俯拍",
      "description": "Establishing aerial shot showing..."
    },
    {
      "index": 1,
      "shotSize": "中景",
      "cameraAngle": "平视",
      "description": "Medium shot at eye level..."
    }
  ]
}

注意：必须恰好返回9个panel（index 0-8），按照九宫格从左到右、从上到下的顺序排列。`
};

export const NINE_GRID_IMAGE_PROMPT_TEMPLATE = {
  prefix: `Generate a SINGLE image composed as a cinematic storyboard with a 3x3 grid layout (9 equal panels).
The image shows the SAME scene from 9 DIFFERENT camera angles and shot sizes.
Each panel is separated by thin white borders.

Visual Style: {visualStyle}

Grid Layout (left to right, top to bottom):`,

  panelTemplate: `Panel {index} ({position}): [{shotSize} / {cameraAngle}] - {description}`,

  suffix: `CRITICAL REQUIREMENTS:
- The output MUST be a SINGLE image divided into exactly 9 equal rectangular panels in a 3x3 grid layout
- Each panel MUST have a thin white border/separator (2-3px) between panels
- All 9 panels show the SAME scene from DIFFERENT camera angles and shot sizes
- Maintain STRICT character consistency across ALL panels (same face, hair, clothing, body proportions)
- Maintain consistent lighting, color palette, and atmosphere across all panels
- Each panel should be a complete, well-composed frame suitable for use as a keyframe
- The overall image should read as a professional cinematographer's shot planning board`
};


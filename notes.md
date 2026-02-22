# Notes: 漫剧流程修复

## Findings
- StageDirector 里镜头负面词会拼接 scene negativePrompt，scene negativePrompt包含 person/people/human 等禁人词。
- generateCharacterTurnaroundImage 固定使用 1:1，但模型能力配置可能不支持 1:1。
- StageAssets 角色生成（包含重生图）未使用已有参考图，导致身份漂移风险。

## Planned Fixes
1. 对有角色的镜头，过滤 scene negativePrompt 中“禁人”类词条。
2. 角色九宫格生成前检测当前激活图片模型支持比例，不支持 1:1 时回退 16:9/9:16。
3. 角色重生图时注入现有角色参考图，并明确 referencePackType=character。

## Implemented
- `components/StageDirector/index.tsx`：新增 `stripHumanExclusionTerms`，并在 `buildShotNegativePrompt` 中仅对“有角色镜头”清洗 scene 禁人词。
- `services/ai/visualService.ts`：
  - `generateImage` 增加 `options.referencePackType`。
  - 参考图说明改为按 `shot/character/scene/prop` 语义生成，避免角色包被误判为“首图=场景”。
  - 新增 `resolveTurnaroundAspectRatio`，九宫格比例自动回退。
  - `generateCharacterTurnaroundImage` 传入 `referencePackType: 'character'`。
- `components/StageAssets/index.tsx`：
  - 角色生成/重生图时自动收集 `character.referenceImage` 与已完成的 `character.turnaround.imageUrl`。
  - 带参考图重生时追加 identity lock 文本约束。
  - 调用 `generateImage` 时传入角色参考图、`hasTurnaround` 标记和 `referencePackType: 'character'`。

## Verification
- 已执行 `npm run build`，构建通过（仅保留既有 chunk size 警告）。

# Task Plan: 漫剧流程关键修复

## Goal
修复关键帧负面词冲突、角色九宫格比例兼容、角色重生图身份一致性问题，并完成构建验证。

## Phases
- [x] Phase 1: 记录问题与改动方案
- [x] Phase 2: 实施代码修复
- [x] Phase 3: 构建验证
- [x] Phase 4: 输出结果与后续建议

## Key Questions
1. 有角色镜头如何避免注入 scene 的禁人负面词？
2. 角色九宫格在不支持 1:1 时如何优雅回退？
3. 角色重生图如何默认锁定身份一致性？

## Decisions Made
- StageDirector：镜头存在角色时，先过滤 scene 负面词中的禁人词，再合并到镜头负面词。
- VisualService：`generateImage` 新增 `referencePackType`，区分 shot/character/scene/prop 参考图语义。
- VisualService：角色九宫格比例改为能力感知，优先 `1:1`，不支持时按 `16:9 -> 9:16` 回退。
- StageAssets：角色重生图默认带入已有角色主参考图与九宫格参考图，并追加 identity lock 指令。

## Errors Encountered
- 修复过程中曾因非补丁写入引发 `StageAssets/index.tsx` 编码污染，已回滚文件并用最小补丁重做，最终构建通过。

## Status
**Completed** - 三项修复均已落地并通过 `npm run build` 验证。

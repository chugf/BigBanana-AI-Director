# Task Plan: Incremental Regeneration + Shot Quality Validator + UTF-8 Guardrails

## Goal
Implement three optimizations: incremental rerun for analyze pipeline, post-generation shot quality validator/repair, and UTF-8 anti-mojibake guardrails.

## Phases
- [ ] Phase 1: Plan and setup
- [ ] Phase 2: Research current pipeline and touchpoints
- [ ] Phase 3: Implement incremental rerun
- [ ] Phase 4: Implement shot quality validator + targeted repair
- [ ] Phase 5: Implement UTF-8 guardrails
- [ ] Phase 6: Build/test and deliver

## Key Questions
1. Where should incremental rerun state be stored and invalidated?
2. What quality rules can be enforced deterministically without overfitting?
3. What guardrails work reliably in this repo and Windows/PowerShell workflow?

## Decisions Made
- Use existing scriptGenerationCheckpoint as base; extend with per-step fingerprints for incremental rerun.

## Errors Encountered
- None yet.

## Status
**Currently in Phase 1** - creating plan and preparing code inspection.

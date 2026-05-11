# UI-6 Regression Notes

Date: 2026-05-10

Scope: UI-6 multi-scenario regression for the existing SOVA AI workflow. This pass did not change backend, APIs, upload handling, Metric Spec Builder, Metric Spec Executor, evidence/report generation, data calculation logic, or scenario profiles.

Method:
- Used synthetic in-memory CSV data for the five requested scenarios because no committed scenario CSV files are present in the repo.
- Exercised the same backend chain used by the UI: upload -> analysis plan -> metric spec build -> metric spec execute -> evidence chain -> report draft.
- Performed static frontend checks for Step 1 example behavior, right-side cockpit persistence, async task feedback wiring, result hierarchy, and responsive overflow classes.
- Ran frontend typecheck separately with `npm.cmd --prefix frontend run typecheck`.
- No `npm build` and no commit.

## Summary

| Scenario | Chain result | Metric result | Notes |
| --- | --- | --- | --- |
| SaaS 7-day activation decline | Pass | Pass | Numerator `activated_within_7d`, denominator `user_id`, 73.80% -> 31.05%, -42.75pp. Top movers sort in decline direction. No coupon issue observed in Step 8/9/10 result content. |
| Customer support SLA breach rise | Pass | Pass | Numerator `is_sla_breached`, denominator `ticket_id`, 15.00% -> 74.68%, +59.68pp. `agent_team` is mapped as handling/support team. Top movers sort in rising direction. |
| Logistics delivery delay rise | Pass | Pass with rounding note | Numerator `is_delayed`, denominator `shipment_id`, 16.39% -> 44.62%, +28.23pp. Expected 44.61%/+28.22pp differs by 0.01pp due normal rounding of 290/650. No user/coupon issue observed in Step 8/9/10 result content. |
| Valorant ranked win-rate decline | Pass | Pass with Top 5 display note | Numerator `result_win`, denominator `match_id`, 57.08% -> 20.40%, -36.68pp. ACS auxiliary metric shows 240.93 -> 232.76 and is referenced by evidence/report. `map_channel` is labeled as map, `queue_type` as queue type. Icebox and Gekko are in Top 5; Texas can be hidden when many tied movers are truncated to five rows. |
| Marketing conversion decline | Pass | Pass for main chain | Numerator `converted`, denominator `visitor_id`, 35.00% -> 17.04%, -17.96pp. Main chain runs through report generation. Some marketing fields need broader profile semantics before polishing. |

## UI Checks

- Step 1 to Step 10: API chain completed for all five scenarios. Static UI wiring shows successful async tasks advance to the next workflow step, while failures call `failTaskFeedback` and stay on the current step.
- Right-side cockpit: present as a persistent `aside`; receives `taskFeedback`, current step, progress, confirmed info, upload state, metric summary, Top movers, auxiliary summary, and next-step suggestions.
- Async feedback: wired for upload, analysis plan, metric calculation, evidence chain, and report draft through `frontend/lib/task-feedback.ts`.
- Step 8 hierarchy: metric comparison is the main result, followed by Top movers, auxiliary comparisons, folded/contained breakdowns, and weakened basic analysis.
- Step 9 evidence: evidence generation returns 4 traceable evidence chains in each tested scenario.
- Step 10 report: report generation returns 8 sections in each tested scenario.
- Step 1 examples: examples are inside a collapsed `details` block. Selecting an example only fills the business problem field and does not submit or advance.
- Small screen: main layout uses a single-column fallback before `lg:grid-cols-[minmax(0,1fr)_380px]`; workflow navigation and result tables use `overflow-x-auto`, so no obvious static horizontal overflow risk was found.

## Backlog

| Issue | Classification | Detail | Follow-up |
| --- | --- | --- | --- |
| Valorant Texas not guaranteed in visible Top 5 | UI display / information hierarchy | In tied Top movers, the Step 8 Top 5 display can show map, role, hero, side, and queue while hiding `server_region=Texas`, even though the backend result has the field available. | Consider a future UI rule that preserves dimension diversity or lets users expand Top movers beyond five. Do not hardcode Texas. |
| Marketing `device_type`, `ad_platform`, `region`, `keyword_group` coverage is partial | Scenario profile generalization | Main chain passes, but not all requested marketing dimensions appear as primary movers/semantic dimensions. | Improve marketing profile/general semantic hints later. Do not target a single CSV. |
| Marketing `bounce_flag` and `form_error_flag` labels are generic | Scenario profile generalization | They are surfaced as auxiliary fields, but labels can remain generic such as "unknown field" depending on semantic context. | Add general semantic labeling for conversion friction flags later. Do not hardcode this test file. |
| Raw upload payload can include internal irrelevant/profile terms | UI display watch item | Broad JSON search can find profile metadata such as coupon-related internal filters, but Step 8/9/10 user-facing metric, evidence, and report content did not surface coupon pollution in this pass. | Keep an eye on upload/schema panels in browser regression; avoid exposing internal profile noise. |

## Files Changed In UI-6

- Added `UI_REGRESSION_NOTES.md`.

No frontend code was changed in this pass.

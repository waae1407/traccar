# uRide Autonomous Marketing Engine — Phase 4 Production Readiness

Status: built and in Approval mode. Autonomous mode is **not** activated. X is disconnected and excluded.

## 1. Rendering architecture (no browser session, no click)

| Layer | Piece | Role |
| --- | --- | --- |
| Render surface | `/flyer-render?campaign=<id>&platform=<platform>` (`src/pages/FlyerRenderPage.jsx`) | Public, deterministic. Draws exactly one platform canvas: the approved 1199x1312 master plate centred on the brand background, never stretched or cropped. No measurement pass, so the paint is identical on every run. Flags `document.body.dataset.flyerReady` once fonts and the hero image have decoded. |
| Master plate | `src/components/marketing/flyer/FlyerPlate.jsx` | The same artwork + live app screen the studio preview uses. One rendering path, so the scheduled output cannot drift from the approved design. |
| Renderer | `base44/functions/marketingRenderFlyer` | Headless browser (Stagehand on the app's own gateway) opens the render surface, screenshots the exact canvas, validates and stores it. |
| Spec read | `base44/functions/getFlyerRenderSpec` | Returns only the flyer copy for one campaign. |

Validation on every image: PNG signature, exact pixel dimensions (1080x1350 Instagram, 1080x1080 Facebook), and a minimum painted size (a blank or 404 surface is rejected). Two attempts per platform per run. A campaign with no valid image cannot publish: `marketingPublish` returns 409 before any API call.

Storage: public object storage, because Instagram and Facebook fetch the file by URL. URLs are written to `MarketingCampaign.assets` and to each `CampaignPublication`.

The old browser canvas path is gone from the publish flow; `PrepareAssetsButton` now calls the backend renderer and is a manual convenience only.

## 2. Meta permissions

Currently granted:

- Instagram: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`
- Facebook Page: `business_management`, `pages_manage_posts`, `pages_show_list`

Required for metrics:

- Instagram: add `instagram_business_manage_insights` — post reach, views/impressions, saves, shares, profile views, follower count.
- Facebook Page: add `read_insights` and `pages_read_engagement` — post media views, post clicks, page followers.

Both need re-authorization from Integrations > Instagram / Facebook Pages after the scopes are added to the Meta app. Until then publishing works and insights stay blank. The collector never writes a zero for a metric the platform did not return: missing values are `null` and listed in `unavailable_metrics`, with the API message kept in `raw.permission_error`.

## 3. Feature discovery

`base44/functions/marketingFeatureDiscovery`, run weekly by the workflow "Marketing Feature Discovery — Weekly".

Signals are real: `ActivityEvent` types and `OperationalAlert` types aggregated over the last 45 days. The model may only propose capabilities those signals evidence, and must cite the exact event names. Every proposal is created `verified: false, enabled: false, source: "discovered"`, so it cannot enter a campaign. Review and approval happen in the Marketing Command Center ("Feature discoveries": Verify and enable, or Discard).

First run proposed two candidates: ADMINISTRATOR OVERRIDE CONTROL and AUTOMATED BOOKING APPROVAL, both unverified and disabled.

## 4. Dynamic campaign intelligence

One campaign per day. No weekly grid: the angle seed is date-derived and the picker closes the widest gap against the mix targets.

Targets (adjustable): awareness 30%, education 25%, problem and solution 20%, engagement 15%, feature discovery 10%.

Fifteen angles now feed those buckets, including myth busting, operator checklist and operator poll. Hard rules are unchanged: no repeat feature on consecutive days, no feature+angle pair inside 14 days, no headline inside 90 days, no caption above 0.6 similarity inside 30 days. Hashtags rotate through three segment sets (Turo hosts, P2P rental, independent operators) plus a feature tag.

## 5. Scheduler

Workflow "Marketing Scheduler — Every 15min" invokes `marketingSchedulerTick`, which runs each step once per day at its configured time:

05:00 review · 05:15 select · 05:30 generate · 05:45 validate · 07:30 render · 08:00 Instagram · 09:30 render (retry) · 10:00 Facebook · 15:00 retry failed publications · 20:00 metrics.

Every step is idempotent per day. Platform steps are skipped when the account is not connected, so X never enters the pipeline.

## 6. Safeguards

- Emergency stop and pause are checked inside `marketingPublish` itself, not only in the scheduler: both return 423 and no API call is made.
- Duplicate prevention: a publication with `external_post_id` or status `published` returns the existing post; a `publishing` status returns 409.
- Retries: bounded at 3 attempts per publication, 20 minutes apart. Render retries are bounded at 2 per run plus one scheduled re-render.
- Unresolved failures email the administrators once per day per failure type.
- Verified-claim enforcement and the quality gate are unchanged.

## 7. Test results

| Test | Result |
| --- | --- |
| Backend render, Instagram, no browser session | Ran end to end. Correctly refused an unpainted surface (33,786 bytes, no ready flag) because the published build does not yet contain `/flyer-render`. This is the intended pre-publish behaviour. |
| Dimension validation | Confirmed: a 2560x1440 capture was rejected with the expected error. |
| Render surface spec read | 200, correct preset for the 2026-11-23 campaign. |
| Unique campaign generation | 200 for a future date: feature `compliance`, angle `operator_poll` (engagement bucket), quality passed, publications created for Instagram and Facebook only. Test campaign removed. |
| X exclusion | No X publication created; scheduler reports `platform_disconnected`. |
| Feature discovery | 200, two telemetry-grounded proposals, both disabled. |
| Marketing control state | 200, new schedule with render steps, scopes recorded. |
| Instagram/Facebook publication | Previously verified in Phase 3; unchanged code path apart from the emergency-stop guard. |
| Emergency stop, expired authorization, duplicate prevention | Guards present in code; live drills pending the publish step. |

## 8. Operating cost

Per day: 96 scheduler invocations (most are no-op ticks), 1 headless browser session (both platforms rendered in one session), 0 AI content calls (generation is deterministic), 2 image uploads (~2-4 MB), ~4 social API calls.

Per month: ~2,880 scheduler ticks, ~30 browser sessions, ~4 AI calls (weekly discovery), ~60 images (~90 MB), ~120 social API calls, ~60 metric reads, 1-2 admin emails.

The billing unit for the browser session and AI calls is the Base44 integration credit; the per-credit price depends on your plan and is shown on Plan and billing. Nothing is spent when a step is not due, when the automation is paused, or when an asset already exists.

## 9. Administrator actions

1. **Publish the app** so `/flyer-render` exists in the deployed build. Until then rendering fails safely and no campaign can publish.
2. Re-authorize Instagram with `instagram_business_manage_insights` and Facebook with `read_insights` + `pages_read_engagement`.
3. Run the renderer once from the Command Center after publishing to confirm both images, then approve one campaign to complete the end-to-end drill.
4. Review the Feature discoveries panel weekly.

## 10. Remaining limitations

- Rendering depends on the published build of the render route; a broken deploy blocks rendering (by design, publishing is blocked with it).
- Insight metrics stay unavailable until the Meta scopes are granted; follower growth is a delta between captures, so the first capture has no growth value.
- Feature discovery proposes from telemetry only; it cannot see code that has never run in production.
- Campaign copy is rule-composed, not model-written, so variety comes from the angle and feature matrix rather than free-form writing.

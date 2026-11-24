import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const PLATFORMS = ["instagram", "facebook_pages", "x"];
const HASHTAG_BASE = ["#CarRental", "#FleetManagement", "#uRide", "#Contactless360"];
const X_LIMIT = 280;

const ANGLES = [
  { key: "pain_point", label: "Customer pain point", kicker: "THE COST OF DOING IT MANUALLY", objective: "Name the frustration before showing the fix", headlines: ["Still\nDoing This\nBy Hand?", "This Is\nWhere The\nWeek Goes.", "The Part\nNobody\nWants To Do."] },
  { key: "benefit", label: "Product benefit", kicker: "WHAT CHANGES DAY TO DAY", objective: "State the practical benefit in plain terms", headlines: ["The Part\nYou Stop\nWorrying About.", "One Less\nThing To\nCheck.", "Quietly\nHandled\nFor You."] },
  { key: "educational", label: "Educational", kicker: "A QUICK WALKTHROUGH", objective: "Teach how the feature works, without selling", headlines: ["How This\nActually\nWorks.", "What Happens\nAfter The\nTap.", "Behind\nThe Screen."] },
  { key: "problem_solution", label: "Problem and solution", kicker: "THE PROBLEM, THEN THE FIX", objective: "Contrast the old failure with the built-in fix", headlines: ["The Problem.\nThe Fix.", "It Used\nTo Break\nHere.", "Old Way.\nNew Way."] },
  { key: "time_savings", label: "Time savings", kicker: "TIME BACK IN YOUR WEEK", objective: "Quantify the admin hours removed", headlines: ["Hours Back\nEvery\nSingle Week.", "Less Admin.\nMore Fleet.", "Your Week,\nReturned."] },
  { key: "revenue_protection", label: "Revenue protection", kicker: "REVENUE, PROTECTED", objective: "Frame the feature as money kept, not money spent", headlines: ["Protect\nThe Revenue.", "Money That\nStays\nYours.", "No Silent\nLeaks."] },
  { key: "vehicle_protection", label: "Vehicle protection", kicker: "THE VEHICLE, PROTECTED", objective: "Frame the feature as asset protection", headlines: ["Protect\nThe Vehicle.", "Your Asset.\nStill\nIntact.", "Watched\nWhen You\nAre Not."] },
  { key: "automation", label: "Business automation", kicker: "OPERATIONS ON AUTOPILOT", objective: "Show the work happening without a person", headlines: ["Set It.\nForget It.", "It Runs\nWithout\nYou.", "No One\nHad To\nRemember."] },
  { key: "engagement_question", label: "Customer engagement question", kicker: "A QUESTION FOR OPERATORS", objective: "Invite a reply instead of pushing a sale", headlines: ["Who Is\nWatching\nThe Fleet?", "What Would\nYou Rather\nDo?", "How Do You\nTrack This\nToday?"] },
  { key: "traditional_vs_automated", label: "Traditional vs automated", kicker: "MANUAL VS. AUTOMATED", objective: "Compare the old operation with the platform", headlines: ["Manual vs.\nAutomated.", "Two Ways\nTo Run\nA Fleet.", "Same Job.\nHalf The\nMoving Parts."] },
  { key: "feature_discovery", label: "Feature discovery", kicker: "INSIDE THE PLATFORM", objective: "Reveal a capability operators already own", headlines: ["You Already\nHave This.", "It Is\nAlready\nOn.", "Hidden In\nPlain\nSight."] },
  { key: "growth", label: "Business growth", kicker: "BUILT TO SCALE", objective: "Connect the feature to adding vehicles", headlines: ["Grow Without\nMore Admin.", "More Cars.\nSame Team.", "Scale The\nFleet, Not\nThe Chaos."] },
];

const headlineText = (value) => String(value || "").replace(/\n/g, " ");

function tokens(text) {
  return new Set(String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
}

function similarity(a, b) {
  const setA = tokens(a);
  const setB = tokens(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  setA.forEach((word) => { if (setB.has(word)) shared += 1; });
  return shared / (setA.size + setB.size - shared);
}

function buildHashtags(feature) {
  const tag = `#${String(feature.label || feature.key).toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  return [...HASHTAG_BASE, tag].join(" ");
}

function fitX(body, hashtags, limit = X_LIMIT) {
  const room = limit - hashtags.length - 2;
  if (body.length <= room) return `${body}\n\n${hashtags}`;
  return `${body.slice(0, Math.max(0, room - 1)).trimEnd()}…\n\n${hashtags}`;
}

function composeCampaign(feature, angle, variant, date) {
  const headline = angle.headlines[variant % angle.headlines.length];
  const flat = headlineText(headline);
  const hashtags = buildHashtags(feature);
  const shape = new Date(`${date}T12:00:00Z`).getUTCDate() % 3;

  const instagram = [
    `${flat}\n\n${feature.claim}\n\nDM “${feature.cta}” for the walkthrough.\n\n${hashtags}`,
    `${flat}\n\n${feature.pain}? ${feature.claim}\n\nIf you run rentals, send “${feature.cta}” and we will show you where it lives.\n\n${hashtags}`,
    `For rental operators: ${feature.claim}\n\n${flat}\n\nReply “${feature.cta}” for a short walkthrough.\n\n${hashtags}`,
  ][shape];

  const facebook = [
    `${flat}\n\n${feature.pain}? ${feature.claim}\n\nThis is already built into the platform. Comment ${feature.cta} or send a message and we will walk you through it.\n\n${hashtags}`,
    `${flat}\n\n${feature.claim}\n\nBuilt for ${String(feature.audience || "rental operators").toLowerCase()}. If that is you, comment ${feature.cta} and we will point you to it.\n\n${hashtags}`,
    `A question for rental operators: ${String(feature.pain || "").toLowerCase()}?\n\n${feature.claim}\n\nComment ${feature.cta} if you want the short version.\n\n${hashtags}`,
  ][shape];

  const xBody = [
    `${flat} ${feature.claim}`,
    `${flat} ${feature.pain}? ${feature.claim}`,
    `${feature.claim} ${flat}`,
  ][shape];

  return {
    campaign_date: date,
    feature_key: feature.key,
    feature_label: feature.label,
    feature_icon: feature.icon || null,
    kicker: angle.kicker,
    headline,
    description: feature.body || feature.claim,
    benefits: feature.benefits || [],
    cta_keyword: feature.cta,
    screen: feature.screen || null,
    audience: feature.audience || null,
    objective: angle.objective,
    pain_point: feature.pain || null,
    angle_key: angle.key,
    angle_label: angle.label,
    caption_instagram: instagram,
    hashtags_instagram: hashtags,
    caption_facebook: facebook,
    hashtags_facebook: hashtags,
    caption_x: fitX(xBody, hashtags, X_LIMIT),
    status: "proposed",
    source: "engine",
    review_note: "",
  };
}

function validateCampaign(campaign, feature, history) {
  const critical = [];
  const warnings = [];
  const text = [
    campaign.headline,
    campaign.caption_instagram,
    campaign.caption_facebook,
    campaign.caption_x,
    campaign.description,
  ].join("\n");

  if (!feature || feature.verified !== true) critical.push("Feature claim is not verified");
  if (!campaign.headline) critical.push("Headline is missing");
  if (!campaign.cta_keyword) critical.push("Call to action keyword is missing");
  if (/meerkat/i.test(text)) critical.push("Forbidden mascot reference found");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) critical.push("Email address found in campaign copy");
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) critical.push("Phone number found in campaign copy");
  if (campaign.caption_x.length > X_LIMIT) critical.push(`X caption is ${campaign.caption_x.length} characters`);
  if (campaign.caption_instagram.length > 2200) critical.push("Instagram caption exceeds 2200 characters");
  if (campaign.caption_facebook.length > 63206) critical.push("Facebook caption exceeds the platform limit");

  if (campaign.feature_key === "payment-guard") {
    if (/(disable|stop|kill)s? (the )?(engine|vehicle|car) while (driving|moving)/i.test(text)) {
      critical.push("Payment Guard copy implies a moving vehicle is disabled");
    }
  }
  if (/safety/i.test(campaign.feature_key || "")) {
    if (/(proof|proves|confirmed) (of )?(illegal|reckless) (driving|activity)/i.test(text)) {
      critical.push("Safety copy presents a suspected pattern as verified proof");
    }
  }

  const lines = String(campaign.headline || "").split("\n");
  if (lines.length > 4) critical.push("Headline has more than four lines");
  if (lines.some((line) => line.length > 26)) warnings.push("A headline line may overflow the flyer badge");
  if (!campaign.screen && !(campaign.rows || []).length) warnings.push("Flyer uses the placeholder panel");

  const recent = (days) => history.filter((item) => {
    const gap = Math.abs(new Date(`${item.campaign_date}T12:00:00Z`) - new Date(`${campaign.campaign_date}T12:00:00Z`)) / 86400000;
    return gap > 0 && gap <= days;
  });
  if (recent(90).some((item) => headlineText(item.headline) === headlineText(campaign.headline))) {
    critical.push("Headline was already used in the last 90 days");
  }
  if (recent(14).some((item) => item.feature_key === campaign.feature_key && item.angle_key === campaign.angle_key)) {
    critical.push("Same feature and angle used in the last 14 days");
  }
  const nearCopy = recent(30).find((item) => similarity(item.caption_instagram, campaign.caption_instagram) > 0.6);
  if (nearCopy) warnings.push(`Caption is close to the ${nearCopy.campaign_date} campaign`);

  return { passed: critical.length === 0, critical, warnings };
}

function pickCandidate(features, history, date) {
  const previous = history[0];
  const seed = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 86400000);
  const angleOrder = [...ANGLES.slice(seed % ANGLES.length), ...ANGLES.slice(0, seed % ANGLES.length)];
  const usedHeadlines = new Set(history.map((item) => headlineText(item.headline)));
  const recent14 = history.filter((item) => {
    const gap = Math.abs(new Date(`${item.campaign_date}T12:00:00Z`) - new Date(`${date}T12:00:00Z`)) / 86400000;
    return gap > 0 && gap <= 14;
  });
  const recent30 = history.filter((item) => {
    const gap = Math.abs(new Date(`${item.campaign_date}T12:00:00Z`) - new Date(`${date}T12:00:00Z`)) / 86400000;
    return gap > 0 && gap <= 30;
  });

  const ordered = [...features].sort((a, b) => (a.use_count || 0) - (b.use_count || 0));

  for (const feature of ordered) {
    if (previous && previous.feature_key === feature.key) continue;
    for (const angle of angleOrder) {
      if (recent14.some((item) => item.feature_key === feature.key && item.angle_key === angle.key)) continue;
      const variant = angle.headlines.findIndex((line) => !usedHeadlines.has(headlineText(line)));
      if (variant === -1) continue;
      const candidate = composeCampaign(feature, angle, variant, date);
      if (recent30.some((item) => similarity(item.caption_instagram, candidate.caption_instagram) > 0.6)) continue;
      return { feature, candidate };
    }
  }

  for (const feature of ordered) {
    if (previous && previous.feature_key === feature.key) continue;
    for (const angle of angleOrder) {
      const variant = angle.headlines.findIndex((line) => !usedHeadlines.has(headlineText(line)));
      if (variant !== -1) return { feature, candidate: composeCampaign(feature, angle, variant, date) };
    }
  }

  const fallback = ordered[0];
  return { feature: fallback, candidate: composeCampaign(fallback, angleOrder[0], 0, date) };
}

async function readSetting(base44, key, fallback) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const row = rows[0];
  if (!row) return fallback;
  if (row.value_string !== undefined && row.value_string !== null) return row.value_string;
  if (row.value_boolean !== undefined && row.value_boolean !== null) return row.value_boolean;
  if (row.value_number !== undefined && row.value_number !== null) return row.value_number;
  return fallback;
}

function captionFor(campaign, platform) {
  if (platform === "instagram") return { caption: campaign.caption_instagram, hashtags: campaign.hashtags_instagram };
  if (platform === "facebook_pages") return { caption: campaign.caption_facebook, hashtags: campaign.hashtags_facebook };
  return { caption: campaign.caption_x, hashtags: "" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const validateOnly = body.validate_only === true;
    const force = body.force === true;
    const timezone = await readSetting(base44, 'marketing_timezone', 'America/Los_Angeles');
    const date = body.date || new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const mode = await readSetting(base44, 'marketing_operating_mode', 'approval');

    const features = await base44.asServiceRole.entities.MarketingFeature.filter({ enabled: true });
    const verified = features.filter((item) => item.verified === true);
    if (!verified.length) {
      return Response.json({ error: 'No verified marketing features. Sync the feature catalog first.' }, { status: 400 });
    }

    const allCampaigns = await base44.asServiceRole.entities.MarketingCampaign.list('-campaign_date', 120);
    const history = allCampaigns.filter((item) => item.campaign_date !== date).sort((a, b) => (a.campaign_date < b.campaign_date ? 1 : -1));
    const existing = allCampaigns.find((item) => item.campaign_date === date);

    if (existing && !force && !validateOnly) {
      return Response.json({ skipped: true, reason: 'Campaign already exists for this date', campaign_id: existing.id });
    }

    let campaign;
    let feature;

    if (validateOnly && existing) {
      campaign = existing;
      feature = verified.find((item) => item.key === existing.feature_key);
    } else {
      const picked = pickCandidate(verified, history, date);
      feature = picked.feature;
      const draft = picked.candidate;
      const report = validateCampaign(draft, feature, history);
      const payload = {
        ...draft,
        operating_mode: mode,
        quality_report: report,
        publish_status: report.passed ? (mode === 'manual' ? 'draft' : 'awaiting_approval') : 'quality_check_failed',
        generated_at: new Date().toISOString(),
        generated_by: user.email || 'scheduler',
      };
      campaign = existing
        ? await base44.asServiceRole.entities.MarketingCampaign.update(existing.id, payload)
        : await base44.asServiceRole.entities.MarketingCampaign.create({ ...payload, day_index: allCampaigns.length + 1 });
      await base44.asServiceRole.entities.MarketingFeature.update(feature.id, {
        use_count: (feature.use_count || 0) + 1,
        last_used_at: date,
        last_angle_key: draft.angle_key,
      });
    }

    const report = validateCampaign(campaign, feature, history);
    const existingPubs = await base44.asServiceRole.entities.CampaignPublication.filter({ campaign_id: campaign.id });
    const publications = [];

    // Only queue platforms that are actually connected for publishing; a
    // disconnected account would otherwise sit in the queue as a dead slot.
    const accounts = await base44.asServiceRole.entities.SocialAccount.list('-created_date', 20);
    const live = accounts
      .filter((item) => item.connection_status === 'connected' && item.can_publish && item.publishing_enabled !== false)
      .map((item) => item.platform);
    const targets = live.length ? PLATFORMS.filter((platform) => live.includes(platform)) : PLATFORMS;

    for (const platform of targets) {
      const { caption, hashtags } = captionFor(campaign, platform);
      const asset = (campaign.assets || {})[platform] || null;
      const current = existingPubs.find((item) => item.platform === platform);
      const locked = current && ['published', 'publishing', 'approved', 'scheduled'].includes(current.status);
      const status = locked
        ? current.status
        : report.passed
          ? (mode === 'manual' ? 'draft' : 'awaiting_approval')
          : 'quality_check_failed';
      const payload = {
        campaign_id: campaign.id,
        campaign_date: campaign.campaign_date,
        platform,
        status,
        caption,
        hashtags,
        image_url: (current && current.image_url) || (asset && asset.url) || null,
        image_width: (current && current.image_width) || (asset && asset.width) || null,
        image_height: (current && current.image_height) || (asset && asset.height) || null,
        idempotency_key: `${campaign.id}:${platform}`,
        quality_report: report,
        mode_at_generation: mode,
        utm_campaign: `uride_${campaign.feature_key}_${campaign.angle_key}_${campaign.campaign_date}`,
      };
      publications.push(
        current
          ? await base44.asServiceRole.entities.CampaignPublication.update(current.id, payload)
          : await base44.asServiceRole.entities.CampaignPublication.create(payload),
      );
    }

    return Response.json({
      campaign_id: campaign.id,
      campaign_date: campaign.campaign_date,
      feature: campaign.feature_key,
      angle: campaign.angle_key,
      quality: report,
      publications: publications.map((item) => ({ id: item.id, platform: item.platform, status: item.status })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { MARKETABLE_FEATURES } from "./featureRegistry";
import { MARKETING_ANGLES, ANGLE_BY_KEY, headlineText } from "./marketingAngles";

const HASHTAG_BASE = ["#CarRental", "#FleetManagement", "#uRide", "#Contactless360"];

const DAY = 86400000;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayGap(a, b) {
  return Math.abs(new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / DAY;
}

export function tokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
  );
}

/** Jaccard overlap of two captions, used to stop campaigns sounding the same. */
export function similarity(a, b) {
  const setA = tokens(a);
  const setB = tokens(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  setA.forEach((word) => {
    if (setB.has(word)) shared += 1;
  });
  return shared / (setA.size + setB.size - shared);
}

export function buildHashtags(feature) {
  const tag = `#${feature.label.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  return [...HASHTAG_BASE, tag].join(" ");
}

function fitX(body, hashtags) {
  const room = 280 - hashtags.length - 2;
  if (body.length <= room) return `${body}\n\n${hashtags}`;
  return `${body.slice(0, room - 1).trimEnd()}…\n\n${hashtags}`;
}

/** One campaign: every deliverable the brief asks for. */
export function composeCampaign({ feature, angle, variant = 0, date }) {
  const headline = angle.headlines[variant % angle.headlines.length];
  const flat = headlineText(headline);
  const hashtags = buildHashtags(feature);
  const shape = new Date(`${date}T12:00:00`).getDate() % 3;

  const instagram = [
    `${flat}\n\n${feature.claim}\n\nDM “${feature.cta}” for the walkthrough.\n\n${hashtags}`,
    `${flat}\n\n${feature.pain}? ${feature.claim}\n\nIf you run rentals, send “${feature.cta}” and we will show you where it lives.\n\n${hashtags}`,
    `For rental operators: ${feature.claim}\n\n${flat}\n\nReply “${feature.cta}” for a short walkthrough.\n\n${hashtags}`,
  ][shape];

  const facebook = [
    `${flat}\n\n${feature.pain}? ${feature.claim}\n\nThis is already built into the platform. Comment ${feature.cta} or send a message and we will walk you through it.\n\n${hashtags}`,
    `${flat}\n\n${feature.claim}\n\nBuilt for ${feature.audience.toLowerCase()}. If that is you, comment ${feature.cta} and we will point you to it.\n\n${hashtags}`,
    `A question for rental operators: ${feature.pain.toLowerCase()}?\n\n${feature.claim}\n\nComment ${feature.cta} if you want the short version.\n\n${hashtags}`,
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
    feature_icon: feature.icon,
    kicker: angle.kicker,
    headline,
    description: feature.body,
    benefits: feature.benefits,
    cta_keyword: feature.cta,
    screen: feature.screen,
    phone: feature.phone || null,
    detail: feature.detail || null,
    rows: feature.rows || [],
    audience: feature.audience,
    objective: angle.objective,
    pain_point: feature.pain,
    angle_key: angle.key,
    angle_label: angle.label,
    caption_instagram: instagram,
    hashtags_instagram: hashtags,
    caption_facebook: facebook,
    hashtags_facebook: hashtags,
    caption_x: fitX(xBody, hashtags),
    status: "proposed",
    source: "engine",
    review_note: "",
  };
}

function anglesFrom(seed) {
  const offset = Math.abs(Math.round(seed)) % MARKETING_ANGLES.length;
  return [...MARKETING_ANGLES.slice(offset), ...MARKETING_ANGLES.slice(0, offset)];
}

/**
 * Plans the next stretch of days. Rules, in order: never the same feature on
 * consecutive days, never the same feature + angle inside 14 days, never a
 * headline used in the last 90 days, never a caption above 0.6 similarity
 * inside 30 days. Angles rotate on their own seeded order, not a weekly grid.
 */
export function planCampaigns({ days = 30, startDate, history = [] } = {}) {
  const start = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
  const past = [...history].sort((a, b) => (a.campaign_date > b.campaign_date ? 1 : -1));
  const planned = [];
  // Day one to four deliberately open with these perspectives.
  const OPENING = ["pain_point", "engagement_question", "educational", "problem_solution"];

  for (let day = 0; day < days; day += 1) {
    const date = isoDate(addDays(start, day));
    const known = [...past, ...planned];
    const previous = known[known.length - 1];
    const recent = (window) => known.filter((item) => dayGap(item.campaign_date, date) <= window);
    const recent14 = recent(14);
    const recent30 = recent(30);
    const usedHeadlines = new Set(recent(90).map((item) => headlineText(item.headline)));

    // Every candidate already satisfies the hard rules: not yesterday's feature,
    // this feature + angle unused for 14 days, headline unused for 90 days.
    const candidates = [];
    for (let offset = 0; offset < MARKETABLE_FEATURES.length; offset += 1) {
      const feature = MARKETABLE_FEATURES[(day + offset) % MARKETABLE_FEATURES.length];
      if (previous && previous.feature_key === feature.key) continue;

      let order = anglesFrom(day * 5 + offset * 3);
      const opening = day < OPENING.length ? ANGLE_BY_KEY[OPENING[day]] : null;
      if (opening) order = [opening, ...order.filter((angle) => angle.key !== opening.key)];

      for (const angle of order) {
        if (recent14.some((item) => item.feature_key === feature.key && item.angle_key === angle.key)) {
          continue;
        }
        const variant = angle.headlines.findIndex((line) => !usedHeadlines.has(headlineText(line)));
        if (variant === -1) continue;
        candidates.push({ feature, angle, variant });
      }
    }

    // Prefer a candidate whose caption is not a near-copy of the last 30 days.
    let draft = null;
    for (const candidate of candidates) {
      const composed = composeCampaign({ ...candidate, date });
      if (recent30.some((item) => similarity(item.caption_instagram, composed.caption_instagram) > 0.6)) {
        continue;
      }
      draft = composed;
      break;
    }
    if (!draft && candidates.length) draft = composeCampaign({ ...candidates[0], date });
    if (!draft) {
      const feature =
        MARKETABLE_FEATURES.find((item) => item.key !== previous?.feature_key) || MARKETABLE_FEATURES[0];
      draft = composeCampaign({ feature, angle: MARKETING_ANGLES[0], variant: 0, date });
    }

    planned.push({ ...draft, day_index: past.length + day + 1 });
  }

  return planned;
}

/** Turns a stored campaign into a flyer preset — the same renderer as the studio. */
export function campaignToPreset(campaign) {
  return {
    id: `campaign-${campaign.id || campaign.campaign_date}`,
    feature: campaign.feature_label,
    kicker: campaign.kicker,
    headline: campaign.headline,
    copy: campaign.description,
    benefits: campaign.benefits || [],
    cta: campaign.cta_keyword,
    featureIcon: campaign.feature_icon,
    screen: campaign.screen,
    phone: campaign.phone,
    detail: campaign.detail,
    rows: campaign.rows || [],
  };
}
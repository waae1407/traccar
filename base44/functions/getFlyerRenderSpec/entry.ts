import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * Public read of the flyer fields for one campaign. Returns only the copy the
 * flyer draws — the render surface is the only caller and the content is
 * published marketing material.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const campaignId = body.campaign_id;
    if (!campaignId) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

    const campaign = await base44.asServiceRole.entities.MarketingCampaign
      .get(campaignId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

    return Response.json({
      campaign_date: campaign.campaign_date,
      preset: {
        id: `campaign-${campaign.id}`,
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
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
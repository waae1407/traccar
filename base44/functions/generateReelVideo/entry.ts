import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import OpenAI from 'npm:openai@6.45.0';

// Bounded AI Gateway video gateway for marketing reels (create + retrieve long-running jobs).
const ALLOWED_MODELS = [
  'seedance_2_5',
  'seedance_2',
  'seedance_2_fast',
  'veo_3_1_fast',
  'veo_3_1_lite',
  'kling_3',
  'wan_3',
  'grok_imagine_video_1_5',
];
const ALLOWED_RESOLUTIONS = ['480p', '720p', '1080p'];
const MAX_SECONDS = 15;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, request, videoId } = await req.json();
    const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
    const videos = new OpenAI({ baseURL, apiKey: token, defaultHeaders: headers }).videos;

    if (action === 'create') {
      const prompt = String(request?.prompt || '').trim();
      if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

      const references = Array.isArray(request?.input_references)
        ? request.input_references.filter((r) => r && typeof r === 'object' && r.type && (r.image_url?.url || r.video_url?.url)).slice(0, 8)
        : [];

      const safeRequest = {
        model: ALLOWED_MODELS.includes(request?.model) ? request.model : 'seedance_2_5',
        prompt: prompt.slice(0, 4000),
        seconds: Math.min(Math.max(Number(request?.seconds) || 10, 1), MAX_SECONDS),
        aspect_ratio: request?.aspect_ratio === '16:9' ? '16:9' : '9:16',
        resolution: ALLOWED_RESOLUTIONS.includes(request?.resolution) ? request.resolution : '1080p',
        generate_audio: request?.generate_audio !== false,
        ...(references.length ? { input_references: references } : {}),
        ...(request?.dry_run ? { dry_run: true } : {}),
      };

      return Response.json(await videos.create(safeRequest, { maxRetries: 0 }), { status: 202 });
    }

    if (action === 'retrieve') {
      if (!videoId) return Response.json({ error: 'videoId is required' }, { status: 400 });
      return Response.json(await videos.retrieve(videoId));
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
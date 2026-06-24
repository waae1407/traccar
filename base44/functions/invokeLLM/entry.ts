import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (e) {
    //
  }

  try {
    const payload = await req.json();
    const { prompt, file_urls = [], response_json_schema, add_context_from_internet } = payload;
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    const parts = [];
    parts.push({ text: prompt });

    if (file_urls && Array.isArray(file_urls)) {
      for (const url of file_urls) {
        if (!url) continue;
        try {
          const res = await fetch(url);
          const arrayBuffer = await res.arrayBuffer();
          const base64 = arrayBufferToBase64(arrayBuffer);
          const mimeType = res.headers.get("content-type") || "image/jpeg";
          parts.push({
            inlineData: {
              data: base64,
              mimeType: mimeType
            }
          });
        } catch (e) {
          console.error("Failed to fetch image URL:", url, e);
        }
      }
    }

    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2
      }
    };

    if (response_json_schema) {
      requestBody.generationConfig.responseMimeType = "application/json";
    }

    if (add_context_from_internet) {
      requestBody.tools = [{ googleSearch: {} }];
    }

    const model = "gemini-1.5-flash-latest";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${JSON.stringify(data)}`);
    }

    if (!data.candidates || !data.candidates[0].content) {
      throw new Error(`Invalid Gemini response: ${JSON.stringify(data)}`);
    }

    const textResult = data.candidates[0].content.parts[0].text;
    
    let finalResult = textResult;
    if (response_json_schema) {
      try {
        finalResult = JSON.parse(textResult);
      } catch (e) {
        // Fallback to raw text if it can't parse
      }
    }

    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: "google",
      model: model,
      function_name: "invokeLLM",
      user_id: user ? user.id : null,
      success: true,
      estimated_cost: 0.0001
    });

    return Response.json(finalResult);

  } catch (error) {
    console.error("invokeLLM error:", error);
    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: "google",
      model: "gemini-1.5-flash-latest",
      function_name: "invokeLLM",
      user_id: user ? user.id : null,
      success: false,
      error_message: error.message
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});
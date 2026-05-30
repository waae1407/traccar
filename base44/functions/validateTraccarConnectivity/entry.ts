import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function envValue(name) {
  return String(Deno.env.toObject()[name] || '').trim();
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function credentialStatus() {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  const status = {
    TRACCAR_BASE_URL: { configured: !!baseUrl, valid: false },
    TRACCAR_USERNAME: { configured: !!username },
    TRACCAR_PASSWORD: { configured: !!password }
  };
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      status.TRACCAR_BASE_URL.valid = ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      status.TRACCAR_BASE_URL.valid = false;
    }
  }
  return { baseUrl, username, password, status };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: 'traccar_noran_mt20' });
    const provider = providers[0] || null;
    const { baseUrl, username, password, status } = credentialStatus();
    const credentialsReady = status.TRACCAR_BASE_URL.configured && status.TRACCAR_BASE_URL.valid && status.TRACCAR_USERNAME.configured && status.TRACCAR_PASSWORD.configured;

    if (!credentialsReady) {
      return Response.json({
        success: false,
        error: 'Traccar credentials are not fully configured.',
        credentials: status,
        device_count: 0,
        sample_device_ids: [],
        server_version: '',
        commands_sent: false,
        execution_mode: provider?.execution_mode || '',
        allow_live_commands: !!provider?.allow_live_commands,
        allow_starter_commands: !!provider?.allow_starter_commands
      });
    }

    const authHeader = 'Basic ' + btoa(`${username}:${password}`);
    let serverVersion = '';
    const serverRes = await fetch(joinUrl(baseUrl, '/api/server'), { headers: { Authorization: authHeader, Accept: 'application/json' } });
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      serverVersion = serverData.version || serverData.serverVersion || '';
    }

    const devicesRes = await fetch(joinUrl(baseUrl, '/api/devices'), { headers: { Authorization: authHeader, Accept: 'application/json' } });
    if (!devicesRes.ok) {
      return Response.json({
        success: false,
        error: `Traccar devices query failed with status ${devicesRes.status}`,
        credentials: status,
        authentication_worked: serverRes.ok || devicesRes.status !== 401,
        devices_query_worked: false,
        device_count: 0,
        sample_device_ids: [],
        server_version: serverVersion,
        commands_sent: false,
        execution_mode: provider?.execution_mode || '',
        allow_live_commands: !!provider?.allow_live_commands,
        allow_starter_commands: !!provider?.allow_starter_commands
      });
    }

    const devices = await devicesRes.json();
    const sampleDeviceIds = (Array.isArray(devices) ? devices : []).slice(0, 5).map(device => String(device.id || device.uniqueId || device.name || '')).filter(Boolean);

    return Response.json({
      success: true,
      credentials: status,
      authentication_worked: true,
      devices_query_worked: true,
      device_count: Array.isArray(devices) ? devices.length : 0,
      sample_device_ids: sampleDeviceIds,
      server_version: serverVersion,
      commands_sent: false,
      execution_mode: provider?.execution_mode || '',
      allow_live_commands: !!provider?.allow_live_commands,
      allow_starter_commands: !!provider?.allow_starter_commands
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message, device_count: 0, sample_device_ids: [], server_version: '', commands_sent: false }, { status: 500 });
  }
});
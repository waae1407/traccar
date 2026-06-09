import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// TELEMATICS CENTER — TAB-BASED LAZY DATA LOADER
// Called only when user opens a specific tab.
// All tabs are paginated. No tab loads more than 50–100 records.
// Target: <2 seconds per tab, <250 KB per response.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const {
      tab,
      host_id: bodyHostId,
      page = 1,
      page_size,
      date_from,
      date_to,
      device_id: filterDeviceId,
      vehicle_id: filterVehicleId,
      provider_key: filterProvider,
    } = body;

    if (!tab) return Response.json({ error: 'tab is required' }, { status: 400 });

    // Resolve host scope
    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const [hosts, hostByUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    // Default date windows per tab
    const now = new Date();
    let defaultDateFrom;
    if (tab === 'commands') {
      defaultDateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (tab === 'events') {
      defaultDateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (tab === 'alerts') {
      defaultDateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (tab === 'installations') {
      defaultDateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }
    const effectiveDateFrom = date_from || (defaultDateFrom ? defaultDateFrom.toISOString().split('T')[0] : null);

    // Per-tab page sizes
    const PAGE_SIZES = { devices: 100, commands: 50, events: 50, alerts: 50, installers: 50, installations: 50, map: 100 };
    const effectivePageSize = page_size || PAGE_SIZES[tab] || 50;
    const offset = (page - 1) * effectivePageSize;
    // We fetch pageSize + 1 to detect has_more
    const fetchLimit = effectivePageSize + 1;

    // ── DEVICES TAB ──────────────────────────────────────────────
    if (tab === 'devices') {
      const devicesRaw = scopedHostId
        ? await base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId }, '-updated_date', fetchLimit + offset)
        : await base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', fetchLimit + offset);

      let filtered = devicesRaw
        .filter(d => !filterVehicleId || d.vehicle_id === filterVehicleId)
        .filter(d => !filterProvider || d.provider_key === filterProvider)
        .filter(d => !filterDeviceId || d.id === filterDeviceId);

      const totalFetched = filtered.length;
      const page_slice = filtered.slice(offset, offset + effectivePageSize);
      const has_more = page_slice.length === effectivePageSize && totalFetched > offset + effectivePageSize;

      // Enrich with vehicle name only (not full vehicle object)
      const vehicleIds = [...new Set(page_slice.map(d => d.vehicle_id).filter(Boolean))];
      let vehicleMap = {};
      if (vehicleIds.length > 0) {
        const vehicles = await Promise.all(
          vehicleIds.slice(0, 20).map(vid =>
            base44.asServiceRole.entities.Vehicle.get(vid).catch(() => null)
          )
        );
        vehicles.filter(Boolean).forEach(v => {
          vehicleMap[v.id] = { id: v.id, year: v.year, make: v.make, model: v.model, vin: v.vin, status: v.status };
        });
      }

      const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);
      const enriched = page_slice.map(d => ({
        ...d,
        vehicle: vehicleMap[d.vehicle_id] || null,
        is_stale: !d.last_seen_at || new Date(d.last_seen_at) < staleCutoff,
      }));

      return Response.json({
        tab: 'devices',
        data: enriched,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: totalFetched,
        generated_at: new Date().toISOString(),
      });
    }

    // ── COMMANDS TAB ─────────────────────────────────────────────
    if (tab === 'commands') {
      // Build device/vehicle scope if needed
      let deviceIds = null;
      let scopedVehicleIds = null;
      if (scopedHostId) {
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter(
          { host_id: scopedHostId }, '-updated_date', 500
        );
        deviceIds = new Set(devices.map(d => d.id));
        scopedVehicleIds = new Set(devices.map(d => d.vehicle_id).filter(Boolean));
      }

      const limit = Math.min(fetchLimit + offset, 200);
      const commandsRaw = await base44.asServiceRole.entities.TelematicsCommand.list('-created_date', limit);

      let filtered = commandsRaw;
      if (deviceIds) {
        filtered = filtered.filter(c =>
          deviceIds.has(c.telematics_device_id) ||
          deviceIds.has(c.device_id) ||
          (c.vehicle_id && scopedVehicleIds.has(c.vehicle_id))
        );
      }
      if (filterDeviceId) filtered = filtered.filter(c => c.telematics_device_id === filterDeviceId || c.device_id === filterDeviceId);
      if (effectiveDateFrom) filtered = filtered.filter(c => !c.created_at || c.created_at >= effectiveDateFrom);

      const page_slice = filtered.slice(offset, offset + effectivePageSize);
      const has_more = filtered.length > offset + effectivePageSize;

      // Strip heavy binary payload fields — not needed for the UI list view
      const lightCommands = page_slice.map(c => ({
        id: c.id,
        command_type: c.command_type,
        queue_status: c.queue_status,
        status: c.status,
        requested_by: c.requested_by,
        requested_role: c.requested_role,
        production_command: c.production_command,
        telematics_device_id: c.telematics_device_id,
        device_id: c.device_id,
        vehicle_id: c.vehicle_id,
        failure_reason: c.failure_reason,
        delivery_latency_ms: c.delivery_latency_ms,
        retry_count: c.retry_count,
        created_at: c.created_at,
        sent_at: c.sent_at,
        provider_key: c.provider_key,
      }));

      return Response.json({
        tab: 'commands',
        data: lightCommands,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: filtered.length,
        date_from: effectiveDateFrom,
        generated_at: new Date().toISOString(),
      });
    }

    // ── EVENTS TAB ───────────────────────────────────────────────
    if (tab === 'events') {
      let deviceIds = null;
      if (scopedHostId) {
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter(
          { host_id: scopedHostId }, '-updated_date', 500
        );
        deviceIds = new Set(devices.map(d => d.id));
      }

      const limit = Math.min(fetchLimit + offset, 200);
      const eventsRaw = filterDeviceId
        ? await base44.asServiceRole.entities.TelematicsEvent.filter({ telematics_device_id: filterDeviceId }, '-created_date', limit)
        : await base44.asServiceRole.entities.TelematicsEvent.list('-created_date', limit);

      let filtered = eventsRaw;
      if (deviceIds) filtered = filtered.filter(e => deviceIds.has(e.telematics_device_id));
      if (effectiveDateFrom) filtered = filtered.filter(e => !e.created_date || e.created_date >= effectiveDateFrom);

      const page_slice = filtered.slice(offset, offset + effectivePageSize);
      const has_more = filtered.length > offset + effectivePageSize;

      return Response.json({
        tab: 'events',
        data: page_slice,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: filtered.length,
        date_from: effectiveDateFrom,
        generated_at: new Date().toISOString(),
      });
    }

    // ── INSTALLERS TAB ───────────────────────────────────────────
    if (tab === 'installers') {
      const limit = fetchLimit + offset;
      const leadsRaw = await base44.asServiceRole.entities.PreferredInstallerLead.list('-created_date', limit);
      const page_slice = leadsRaw.slice(offset, offset + effectivePageSize);
      const has_more = leadsRaw.length > offset + effectivePageSize;

      return Response.json({
        tab: 'installers',
        data: page_slice,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: leadsRaw.length,
        generated_at: new Date().toISOString(),
      });
    }

    // ── INSTALLATIONS TAB ────────────────────────────────────────
    if (tab === 'installations') {
      const limit = fetchLimit + offset;
      const recordsRaw = scopedHostId
        ? await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ host_id: scopedHostId }, '-created_date', limit)
        : await base44.asServiceRole.entities.TelematicsInstallRecord.list('-created_date', limit);

      let filtered = recordsRaw;
      if (filterVehicleId) filtered = filtered.filter(r => r.vehicle_id === filterVehicleId);
      if (effectiveDateFrom) filtered = filtered.filter(r => !r.created_date || r.created_date >= effectiveDateFrom);

      const page_slice = filtered.slice(offset, offset + effectivePageSize);
      const has_more = filtered.length > offset + effectivePageSize;

      return Response.json({
        tab: 'installations',
        data: page_slice,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: filtered.length,
        date_from: effectiveDateFrom,
        generated_at: new Date().toISOString(),
      });
    }

    // ── ALERTS TAB ───────────────────────────────────────────────
    if (tab === 'alerts') {
      const limit = fetchLimit + offset;
      const alertsRaw = await base44.asServiceRole.entities.OperationalAlert.filter(
        { domain: 'telematics' }, '-created_date', limit
      );

      let filtered = alertsRaw;
      if (effectiveDateFrom) filtered = filtered.filter(a => !a.created_date || a.created_date >= effectiveDateFrom);

      const page_slice = filtered.slice(offset, offset + effectivePageSize);
      const has_more = filtered.length > offset + effectivePageSize;

      return Response.json({
        tab: 'alerts',
        data: page_slice,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: filtered.length,
        date_from: effectiveDateFrom,
        generated_at: new Date().toISOString(),
      });
    }

    // ── MAP TAB ──────────────────────────────────────────────────
    if (tab === 'map') {
      // Latest position only — no history
      const devices = scopedHostId
        ? await base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId }, '-updated_date', 500)
        : await base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500);

      const withPosition = devices.filter(d => d.last_latitude && d.last_longitude);
      const page_slice = withPosition.slice(offset, offset + effectivePageSize);
      const has_more = withPosition.length > offset + effectivePageSize;

      const positions = page_slice.map(d => ({
        id: d.id,
        unique_id: d.unique_id,
        vehicle_id: d.vehicle_id,
        provider_key: d.provider_key,
        online_status: d.online_status,
        starter_disabled: d.starter_disabled,
        last_latitude: d.last_latitude,
        last_longitude: d.last_longitude,
        last_seen_at: d.last_seen_at,
        speed: d.speed,
        course: d.course,
        address: d.address,
      }));

      return Response.json({
        tab: 'map',
        data: positions,
        page,
        page_size: effectivePageSize,
        has_more,
        total_fetched: withPosition.length,
        generated_at: new Date().toISOString(),
      });
    }

    // ── DEVICE DETAIL (drawer) ──────────────────────────────────
    if (tab === 'device_detail') {
      if (!filterDeviceId) return Response.json({ error: 'device_id required for device_detail tab' }, { status: 400 });

      const [device, recentCmds, recentAlerts] = await Promise.all([
        base44.asServiceRole.entities.TelematicsDevice.get(filterDeviceId).catch(() => null),
        base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 25),
        base44.asServiceRole.entities.OperationalAlert.filter({ domain: 'telematics' }, '-created_date', 10),
      ]);

      if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

      // Permission check
      if (!isAdmin && scopedHostId && device.host_id !== scopedHostId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const deviceCmds = recentCmds.filter(c =>
        c.telematics_device_id === filterDeviceId || c.device_id === filterDeviceId
      );
      const deviceAlerts = recentAlerts.filter(a => a.source_entity_id === filterDeviceId);

      let vehicle = null;
      if (device.vehicle_id) {
        vehicle = await base44.asServiceRole.entities.Vehicle.get(device.vehicle_id).catch(() => null);
      }

      return Response.json({
        tab: 'device_detail',
        device,
        vehicle,
        recent_commands: deviceCmds.slice(0, 25),
        recent_alerts: deviceAlerts.slice(0, 10),
        generated_at: new Date().toISOString(),
      });
    }

    return Response.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
  } catch (error) {
    console.error('[getTelematicsTabData]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
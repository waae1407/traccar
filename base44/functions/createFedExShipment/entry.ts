import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const FEDEX_API_BASE = 'https://apis.fedex.com';

/**
 * createFedExShipment — Admin creates a FedEx shipping label for a GPS order.
 *
 * Requires PlatformSetting "fedex_shipper_address" (JSON) with:
 *   personName, companyName, phoneNumber, street, city, state, zip
 *
 * Returns: { tracking_number, carrier, label_url, service_type }
 */
async function getFedExToken() {
  const clientId = Deno.env.get('FEDEX_CLIENT_ID');
  const clientSecret = Deno.env.get('FEDEX_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('FedEx API credentials not configured (FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET).');

  const res = await fetch(`${FEDEX_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FedEx auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const {
      order_id,
      recipient_name,
      recipient_phone,
      street_lines,
      city,
      state,
      zip,
      service_type = 'FEDEX_GROUND',
    } = await req.json();

    if (!order_id || !recipient_name || !street_lines || !city || !state || !zip) {
      return Response.json({ error: 'order_id, recipient_name, street_lines, city, state, zip are required.' }, { status: 400 });
    }

    const accountNumber = Deno.env.get('FEDEX_ACCOUNT_NUMBER');
    if (!accountNumber) throw new Error('FEDEX_ACCOUNT_NUMBER not configured.');

    // ── Get shipper (from) address from PlatformSetting ──
    const shipperSettings = await base44.asServiceRole.entities.PlatformSetting.filter({ key: 'fedex_shipper_address' });
    const shipperRecord = shipperSettings[0];
    if (!shipperRecord || !shipperRecord.value_string) {
      return Response.json({
        error: 'Shipper address not configured. Create a PlatformSetting with key "fedex_shipper_address" containing JSON: {"personName":"...","companyName":"...","phoneNumber":"...","street":"...","city":"...","state":"CA","zip":"90001"}',
      }, { status: 400 });
    }
    const shipper = JSON.parse(shipperRecord.value_string);

    // ── Get FedEx OAuth token ──
    const token = await getFedExToken();

    // ── Create shipment ──
    const shipDate = new Date().toISOString().split('T')[0];
    const shipBody = {
      labelResponseOptions: 'URL_ONLY',
      requestedShipment: {
        shipper: {
          contact: {
            personName: shipper.personName || 'Contactless360',
            companyName: shipper.companyName || 'Contactless360 GPS',
            phoneNumber: shipper.phoneNumber || '',
          },
          address: {
            streetLines: [shipper.street],
            city: shipper.city,
            stateOrProvinceCode: shipper.state,
            postalCode: shipper.zip,
            countryCode: 'US',
          },
        },
        recipients: [{
          contact: {
            personName: recipient_name,
            phoneNumber: recipient_phone || '',
          },
          address: {
            streetLines: Array.isArray(street_lines) ? street_lines : [street_lines],
            city,
            stateOrProvinceCode: state,
            postalCode: zip,
            countryCode: 'US',
          },
        }],
        shipDatestamp: shipDate,
        serviceType: service_type,
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'USE_SCHEDULED_PICKUP',
        labelSpecification: {
          imageType: 'PDF',
          labelStockType: 'PAPER_4X6',
        },
        requestedPackageLineItems: [{
          weight: { value: 1.0, units: 'LB' },
        }],
      },
      accountNumber: { value: accountNumber },
    };

    const shipRes = await fetch(`${FEDEX_API_BASE}/ship/v1/shipments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US',
      },
      body: JSON.stringify(shipBody),
      signal: AbortSignal.timeout(30000),
    });

    const shipData = await shipRes.json();
    if (!shipRes.ok) {
      const fedExError = shipData?.errors?.[0]?.message || shipData?.error?.message || JSON.stringify(shipData);
      return Response.json({ error: `FedEx shipment failed: ${fedExError}` }, { status: 502 });
    }

    const completed = shipData?.output?.completedShipmentDetail;
    const trackingNumber = completed?.masterTrackingNumber || '';
    const labelUrl = completed?.shipmentDocuments?.[0]?.url || '';

    if (!trackingNumber) {
      return Response.json({ error: 'FedEx returned no tracking number.', raw: shipData }, { status: 502 });
    }

    // ── Store tracking on the order (markGPSOrderShipped will finalize) ──
    await base44.asServiceRole.entities.GPSOrder.update(order_id, {
      tracking_number: trackingNumber,
      carrier: 'FedEx',
    }).catch(() => {});

    // ── Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'GPSOrder',
      target_id: order_id,
      summary: `FedEx label created — tracking ${trackingNumber}, service ${service_type}`,
      metadata: { tracking_number: trackingNumber, label_url: labelUrl, service_type },
      source: 'admin',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({
      success: true,
      tracking_number: trackingNumber,
      carrier: 'FedEx',
      label_url: labelUrl,
      service_type,
    });
  } catch (err) {
    console.error('[createFedExShipment]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
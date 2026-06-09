import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_TERMS = [
  'auto alarm installer',
  'car alarm installer',
  'GPS tracker installer',
  'vehicle GPS installer',
  'car audio installation',
  'vehicle security installer',
  '12 volt installer',
  'fleet upfitter'
];

const VERIFIED_STATUSES = new Set(['in_progress', 'almost_verified', 'verified', 'preferred', 'suspended']);

function clean(value) { return String(value || '').trim(); }
function norm(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function cleanPhone(value) { return clean(value).replace(/[^0-9+]/g, ''); }
function metersFromMiles(miles) { return Math.max(1, Number(miles || 25)) * 1609.344; }
function getComponent(place, type, key = 'longText') {
  const component = (place.addressComponents || place.address_components || []).find(item => item.types?.includes(type));
  if (!component) return '';
  if (key === 'shortText') return component.shortText || component.short_name || '';
  return component.longText || component.long_name || '';
}
function parseAddress(place) {
  const street = [getComponent(place, 'street_number'), getComponent(place, 'route')].filter(Boolean).join(' ');
  return {
    address: street || clean(place.formattedAddress),
    city: getComponent(place, 'locality') || getComponent(place, 'sublocality') || getComponent(place, 'administrative_area_level_3'),
    state: getComponent(place, 'administrative_area_level_1', 'shortText'),
    zip: getComponent(place, 'postal_code')
  };
}
function installerKey(item) {
  return `${norm(item.business_name || item.installer_name)}|${norm(item.business_address)}|${norm(item.business_zip)}`;
}
function payloadFromPlace(place, now) {
  const address = parseAddress(place);
  const name = clean(place.displayName?.text || place.name || 'Listed Installer');
  const phone = cleanPhone(place.nationalPhoneNumber || place.internationalPhoneNumber || place.formatted_phone_number || place.international_phone_number || '');
  const lat = Number(place.location?.latitude ?? place.geometry?.location?.lat);
  const lon = Number(place.location?.longitude ?? place.geometry?.location?.lng);
  return {
    installer_name: name,
    business_name: name,
    business_address: address.address,
    business_city: address.city,
    business_state: address.state,
    business_zip: address.zip,
    business_latitude: lat,
    business_longitude: lon,
    installer_phone: phone,
    phone,
    website: clean(place.websiteUri || place.website),
    google_place_id: clean(place.id || place.place_id),
    google_rating: Number(place.rating || 0),
    google_review_count: Number(place.userRatingCount || place.user_ratings_total || 0),
    source: 'google_places',
    installer_status: 'listed',
    verification_progress_count: 0,
    verification_required_count: 3,
    claim_status: 'unclaimed',
    lead_status: 'imported',
    is_public: true,
    location_verified: Number.isFinite(lat) && Number.isFinite(lon),
    joined_preferred_network: false,
    created_at: now,
    updated_at: now
  };
}
async function fetchPlaceDetails(placeId, apiKey) {
  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    fields: 'place_id,name,formatted_address,address_components,geometry,formatted_phone_number,international_phone_number,website,rating,user_ratings_total'
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.status === 'OK' ? data.result : null;
}
async function searchTextNew(term, latitude, longitude, radiusMiles, apiKey) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount'
    },
    body: JSON.stringify({
      textQuery: term,
      maxResultCount: 10,
      locationBias: { circle: { center: { latitude: Number(latitude), longitude: Number(longitude) }, radius: metersFromMiles(radiusMiles) } }
    })
  });
  if (!response.ok) throw new Error(`Places API New failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.places || [];
}
async function searchTextLegacy(term, latitude, longitude, radiusMiles, apiKey) {
  const params = new URLSearchParams({
    query: term,
    location: `${Number(latitude)},${Number(longitude)}`,
    radius: String(Math.round(metersFromMiles(radiusMiles))),
    key: apiKey
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`);
  if (!response.ok) throw new Error(`Legacy Places failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!['OK', 'ZERO_RESULTS'].includes(data.status)) throw new Error(`Legacy Places failed: ${data.status} ${data.error_message || ''}`);
  const results = (data.results || []).slice(0, 10);
  const detailed = [];
  for (const result of results) {
    const details = result.place_id ? await fetchPlaceDetails(result.place_id, apiKey) : null;
    detailed.push(details || result);
  }
  return detailed;
}
async function searchPlaces(term, latitude, longitude, radiusMiles, apiKey) {
  try {
    return await searchTextNew(term, latitude, longitude, radiusMiles, apiKey);
  } catch (newError) {
    try {
      return await searchTextLegacy(term, latitude, longitude, radiusMiles, apiKey);
    } catch (legacyError) {
      throw new Error(`${newError.message} | ${legacyError.message}`);
    }
  }
}
async function findExisting(base44, payload, cached) {
  if (payload.google_place_id) {
    const byPlace = await base44.asServiceRole.entities.PreferredInstallerLead.filter({ google_place_id: payload.google_place_id });
    if (byPlace[0]) return byPlace[0];
  }
  const key = installerKey(payload);
  return cached.find(item => installerKey(item) === key) || null;
}
function updatePayload(existing, payload, now) {
  const protectedStatus = VERIFIED_STATUSES.has(existing.installer_status);
  return {
    business_name: payload.business_name || existing.business_name,
    business_address: payload.business_address || existing.business_address,
    business_city: payload.business_city || existing.business_city,
    business_state: payload.business_state || existing.business_state,
    business_zip: payload.business_zip || existing.business_zip,
    business_latitude: Number.isFinite(payload.business_latitude) ? payload.business_latitude : existing.business_latitude,
    business_longitude: Number.isFinite(payload.business_longitude) ? payload.business_longitude : existing.business_longitude,
    installer_phone: existing.installer_phone || payload.installer_phone,
    phone: existing.phone || payload.phone,
    website: existing.website || payload.website,
    google_place_id: existing.google_place_id || payload.google_place_id,
    google_rating: payload.google_rating || existing.google_rating || 0,
    google_review_count: payload.google_review_count || existing.google_review_count || 0,
    source: existing.source || 'google_places',
    installer_status: protectedStatus ? existing.installer_status : (existing.installer_status || 'listed'),
    verification_progress_count: existing.verification_progress_count || 0,
    verification_required_count: existing.verification_required_count || 3,
    claim_status: existing.claim_status || 'unclaimed',
    lead_status: existing.lead_status || 'imported',
    is_public: existing.is_public !== false,
    location_verified: existing.location_verified === true || payload.location_verified === true,
    updated_at: now
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radiusMiles = Number(body.radius_miles || 25);
    const terms = Array.isArray(body.search_terms) && body.search_terms.length ? body.search_terms : DEFAULT_TERMS;
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return Response.json({ error: 'GOOGLE_PLACES_API_KEY is not configured' }, { status: 500 });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Response.json({ error: 'latitude and longitude are required' }, { status: 400 });

    const now = new Date().toISOString();
    const existingCache = await base44.asServiceRole.entities.PreferredInstallerLead.list('-updated_at', 1000);
    const seenPlaces = new Set();
    const seenBusinessKeys = new Set();
    const imported = [];

    for (const term of terms.slice(0, 12)) {
      const places = await searchPlaces(term, latitude, longitude, radiusMiles, apiKey);
      for (const place of places) {
        const payload = payloadFromPlace(place, now);
        if (!payload.business_name || !payload.google_place_id) continue;
        const businessKey = installerKey(payload);
        if (seenPlaces.has(payload.google_place_id) || seenBusinessKeys.has(businessKey)) continue;
        seenPlaces.add(payload.google_place_id);
        seenBusinessKeys.add(businessKey);

        const existing = await findExisting(base44, payload, existingCache);
        const record = existing
          ? await base44.asServiceRole.entities.PreferredInstallerLead.update(existing.id, updatePayload(existing, payload, now))
          : await base44.asServiceRole.entities.PreferredInstallerLead.create(payload);
        imported.push(record);
      }
    }

    return Response.json({ ok: true, imported_count: imported.length, installers: imported });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
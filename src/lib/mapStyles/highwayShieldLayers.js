import { INTERSTATE_PREFIX, SHIELD_PIXEL_RATIO, createInterstateShieldImage } from "./interstateShield";
import { ROUTE_BADGE_PREFIX, createRouteBadgeImage } from "./routeBadge";

const isInterstate = ["==", ["get", "network"], "us-interstate"];
const hasRef = ["has", "ref"];

const sharedLayout = {
  "symbol-placement": "line",
  "symbol-spacing": 400,
  "icon-rotation-alignment": "viewport",
  "icon-padding": 6,
};

// Badges first, Interstate shields last so shields win label collisions.
export const HIGHWAY_SHIELD_LAYERS = [
  {
    id: "highway_route_badges",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "transportation_name",
    minzoom: 8,
    maxzoom: 15,
    filter: ["all", hasRef, ["!", isInterstate], ["match", ["get", "class"], ["motorway", "trunk"], true, false]],
    layout: { ...sharedLayout, "icon-image": ["concat", ROUTE_BADGE_PREFIX, ["get", "ref"]] },
  },
  {
    id: "highway_shield_refs",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "transportation_name",
    minzoom: 6,
    maxzoom: 15,
    filter: ["all", hasRef, isInterstate],
    layout: { ...sharedLayout, "icon-image": ["concat", INTERSTATE_PREFIX, ["get", "ref"]] },
  },
];

/** Generates shield/badge images on demand (one per route number). */
export function handleShieldImageMissing(map, id) {
  if (map.hasImage(id)) return;
  if (id.startsWith(INTERSTATE_PREFIX)) {
    map.addImage(id, createInterstateShieldImage(id.slice(INTERSTATE_PREFIX.length)), { pixelRatio: SHIELD_PIXEL_RATIO });
  } else if (id.startsWith(ROUTE_BADGE_PREFIX)) {
    map.addImage(id, createRouteBadgeImage(id.slice(ROUTE_BADGE_PREFIX.length)), { pixelRatio: SHIELD_PIXEL_RATIO });
  }
}
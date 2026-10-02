// Custom MapLibre style: muted dark-slate "night mode" palette.
// Low-contrast gray roads on charcoal land — calmer alternative to the neon style.
// Uses free OpenFreeMap vector tiles (no API key).
export const mutedDarkSlateStyle = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    // ── Background: dark charcoal ──
    { id: "background", type: "background", paint: { "background-color": "#1a1e22" } },

    // ── Water: near-black slate ──
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-color": "#15181b" },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": "#15181b", "line-width": 1 },
    },

    // ── Land features: subtle dark variations ──
    { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": "#1d2226" } },
    {
      id: "landcover_wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": "#1d2226" },
    },
    {
      id: "landcover_grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "grass"],
      paint: { "fill-color": "#1c2125" },
    },
    {
      id: "landcover_ice",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "ice"],
      paint: { "fill-color": "#1a1e22" },
    },
    {
      id: "landuse",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: { "fill-color": "#1a1e22" },
    },
    {
      id: "aeroway_fill",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 11,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      paint: { "fill-color": "#1a1e22" },
    },
    {
      id: "aeroway_runway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 11,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "runway"],
      ],
      paint: {
        "line-color": "#2f363c",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 11, 2, 20, 12],
        "line-opacity": 0.6,
      },
    },
    {
      id: "aeroway_taxiway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 11,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "taxiway"],
      ],
      paint: {
        "line-color": "#2f363c",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 11, 0.5, 20, 5],
        "line-opacity": 0.5,
      },
    },

    // ── Buildings: slightly lighter slate ──
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      paint: { "fill-color": "#22272d", "fill-opacity": 0.6 },
    },

    // ═══ Road casing (darker outline for definition) ═══
    {
      id: "road_casing_motorway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["==", ["get", "class"], "motorway"],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1a1e22",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 2.5, 20, 14],
      },
    },
    {
      id: "road_casing_trunk_primary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["trunk", "primary"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1a1e22",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 2, 20, 11],
      },
    },
    {
      id: "road_casing_secondary_tertiary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["secondary", "tertiary"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1a1e22",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 1.5, 20, 9],
      },
    },
    {
      id: "road_casing_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["minor", "street", "street_limited"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1a1e22",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 13, 1, 20, 6],
      },
    },

    // ═══ Road fill (muted slate blue-gray) ═══
    {
      id: "road_motorway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["==", ["get", "class"], "motorway"],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#3a424a",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 1.5, 20, 11],
      },
    },
    {
      id: "road_trunk_primary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["trunk", "primary"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#343c43",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 1.2, 20, 9],
      },
    },
    {
      id: "road_secondary_tertiary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["secondary", "tertiary"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#2f363c",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 0.9, 20, 7],
      },
    },
    {
      id: "road_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["minor", "street", "street_limited"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#2a3036",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 13, 0.5, 20, 5],
      },
    },
    {
      id: "road_service",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["service", "track"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#262c32",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 15, 0.4, 20, 3],
        "line-opacity": 0.7,
      },
    },
    {
      id: "road_path",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["get", "class"], ["path", "pedestrian"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#262c32",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 14, 0.3, 20, 2],
        "line-opacity": 0.5,
        "line-dasharray": [1, 1],
      },
    },
    // ── Street name labels ──
    {
      id: "road_labels",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 14],
        "text-letter-spacing": 0.04,
      },
      paint: {
        "text-color": "#889096",
        "text-halo-color": "#15181b",
        "text-halo-width": 1.4,
      },
    },
  ],
};
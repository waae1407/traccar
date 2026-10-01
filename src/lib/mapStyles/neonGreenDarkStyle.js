// Custom MapLibre style: black land (#0a0a0a) with neon green (#39ff14) glowing roads.
// Matches the "My Vehicle" mockup aesthetic. Uses free OpenFreeMap vector tiles (no API key).
export const neonGreenDarkStyle = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    // ── Background: pure black ──
    { id: "background", type: "background", paint: { "background-color": "#0a0a0a" } },

    // ── Water: near-black ──
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-color": "#060606" },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": "#060606", "line-width": 1 },
    },

    // ── Land features: subtle dark variations ──
    { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": "#0d0d0d" } },
    {
      id: "landcover_wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": "#0d0d0d" },
    },
    {
      id: "landcover_grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "grass"],
      paint: { "fill-color": "#0c0c0c" },
    },
    {
      id: "landcover_ice",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "ice"],
      paint: { "fill-color": "#0a0a0a" },
    },
    {
      id: "landuse",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: { "fill-color": "#0a0a0a" },
    },
    {
      id: "aeroway_fill",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 11,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      paint: { "fill-color": "#0a0a0a" },
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 11, 2, 20, 12],
        "line-opacity": 0.4,
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 11, 0.5, 20, 5],
        "line-opacity": 0.3,
      },
    },

    // ── Buildings: very dark grey ──
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      paint: { "fill-color": "#101010", "fill-opacity": 0.5 },
    },

    // ═══ Road glow layers (wide, blurred, low opacity for neon effect) ═══
    {
      id: "road_glow_motorway",
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 3, 20, 20],
        "line-blur": 4,
        "line-opacity": 0.35,
      },
    },
    {
      id: "road_glow_trunk_primary",
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 2.5, 20, 16],
        "line-blur": 3,
        "line-opacity": 0.28,
      },
    },
    {
      id: "road_glow_secondary_tertiary",
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 2, 20, 12],
        "line-blur": 2.5,
        "line-opacity": 0.22,
      },
    },
    {
      id: "road_glow_minor",
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 13, 1.5, 20, 8],
        "line-blur": 2,
        "line-opacity": 0.18,
      },
    },

    // ═══ Road fill layers (solid neon green) ═══
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 1.2, 20, 10],
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 1, 20, 8],
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 0.7, 20, 6],
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 13, 0.4, 20, 4],
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 15, 0.3, 20, 3],
        "line-opacity": 0.5,
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
        "line-color": "#39ff14",
        "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 14, 0.2, 20, 2],
        "line-opacity": 0.35,
        "line-dasharray": [1, 1],
      },
    },
  ],
};
// Satellite/orbital map style using Esri World Imagery raster tiles.
// Matches the original "My Vehicle" map aesthetic (darkened satellite imagery).
export const satelliteStyle = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "© Esri",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
      paint: {
        "raster-opacity": 0.88,
        "raster-saturation": -0.15,
        "raster-contrast": 0.05,
      },
    },
  ],
};
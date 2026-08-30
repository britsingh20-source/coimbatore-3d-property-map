import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { properties } from "./properties.js";

const CENTER = [76.9005, 11.029];
const propertyGeoJSON = {
  type: "FeatureCollection",
  features: properties.map((property) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: property.coordinates },
    properties: { id: property.id, kind: property.type === "Plot" ? "Plot" : "Villa" }
  }))
};

document.querySelector("#app").innerHTML = [
  '<div id="map" aria-label="Interactive 3D property map of Vadavalli"></div>',
  '<div id="loading"><span></span><b>Building Vadavalli in 3D…</b><small id="load-note">Loading roads, terrain and properties</small></div>',
  '<header><div class="logo">CV</div><div><b>CoimbatoreVeedu</b><small id="map-mode">Vadavalli 3D Property Map</small></div><button id="reset" aria-label="View all properties" title="View all properties">⌖</button></header>',
  '<section class="summary"><b>Vadavalli · 7 km radius</b><small>' + properties.length + ' properties available</small></section>',
  '<nav class="view-controls" aria-label="Map view"><button id="view-toggle" class="active" aria-pressed="true"><span>◆</span> 3D view</button><button id="recenter" aria-label="Recenter map">⌖</button></nav>',
  '<section class="legend"><b><i></i> Plot</b><b><i class="orange"></i> Villa</b><small>Tap a budget pin</small></section>',
  '<dialog id="details"><button class="close" aria-label="Close">×</button><div id="detail-content"></div></dialog>'
].join("");

const loading = document.querySelector("#loading");
const modeLabel = document.querySelector("#map-mode");
const viewToggle = document.querySelector("#view-toggle");
let activeMap;
let renderer = "maplibre";
let threeDimensional = true;

function openDetails(property) {
  document.querySelector("#detail-content").innerHTML = [
    '<div class="detail-head"><span>', property.type, '</span><strong>', property.price,
    '</strong><small>⌖ ', property.address, '</small></div><div class="detail-body"><h2>',
    property.title, '</h2><div class="specs"><p><small>Property size</small><b>', property.size,
    '</b></p><p><small>Facing</small><b>', property.facing,
    '</b></p><p><small>Approval</small><b>', property.approval,
    '</b></p><p><small>Approach road</small><b>', property.road,
    '</b></p></div><ul>', property.features.map((feature) => '<li>✓ ' + feature + '</li>').join(""),
    '</ul><button class="enquire">Schedule a site visit →</button>',
    '<p class="location-note">Pin shown at the supplied property location. Site pad is a location highlight, not a legal boundary.</p></div>'
  ].join("");
  document.querySelector("#details").showModal();
}

function makeMarker(property) {
  const marker = document.createElement("button");
  marker.className = property.type === "Plot" ? "marker" : "marker villa";
  marker.innerHTML = "<strong>" + property.price + "</strong><small>" + property.type + "</small>";
  marker.setAttribute("aria-label", "Open " + property.title);
  return marker;
}

function finishLoading() {
  window.setTimeout(() => loading.classList.add("hidden"), 250);
}

function addMapLibreProperties() {
  activeMap.addSource("property-sites", { type: "geojson", data: propertyGeoJSON });
  activeMap.addLayer({
    id: "property-site-shadow", type: "circle", source: "property-sites",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 7, 18, 34],
      "circle-color": "#092f29", "circle-opacity": 0.22, "circle-blur": 0.45, "circle-translate": [7, 11]
    }
  });
  activeMap.addLayer({
    id: "property-site-pad", type: "circle", source: "property-sites",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 18, 27],
      "circle-color": ["match", ["get", "kind"], "Plot", "#23a88b", "#e77a49"],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
      "circle-opacity": 0.78, "circle-pitch-alignment": "map"
    }
  });
  properties.forEach((property) => {
    const marker = makeMarker(property);
    marker.onclick = () => {
      activeMap.flyTo({ center: property.coordinates, zoom: 17.2, pitch: 68, bearing: -28, duration: 1400 });
      openDetails(property);
    };
    new maplibregl.Marker({ element: marker, anchor: "bottom" }).setLngLat(property.coordinates).addTo(activeMap);
  });
}

function start3D() {
  renderer = "maplibre";
  document.body.classList.add("true-3d");
  modeLabel.textContent = "Live 3D · OpenFreeMap";
  activeMap = new maplibregl.Map({
    container: "map", style: "https://tiles.openfreemap.org/styles/liberty",
    center: CENTER, zoom: 13.25, pitch: 64, bearing: -24,
    antialias: true, maxPitch: 85, attributionControl: true
  });
  activeMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  activeMap.on("load", () => {
    const layers = activeMap.getStyle().layers || [];
    const firstLabel = layers.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;
    if (!layers.some((layer) => layer.type === "fill-extrusion")) {
      try {
        activeMap.addLayer({
          id: "vadavalli-3d-buildings", source: "openmaptiles", "source-layer": "building",
          minzoom: 13.5, type: "fill-extrusion",
          paint: {
            "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], ["get", "height"], 8], 0, "#ded8cc", 15, "#c6beb0", 45, "#a59b8c"],
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.9
          }
        }, firstLabel);
      } catch (error) {
        console.info("Building extrusion layer unavailable for this tile.", error);
      }
    }
    addMapLibreProperties();
    finishLoading();
  });
}

function siteIcon(property) {
  const kind = property.type === "Plot" ? "plot" : "villa";
  return L.divIcon({
    className: "site-icon-wrapper",
    html: '<div class="site-prism ' + kind + '"><span></span><i></i></div>',
    iconSize: [72, 54], iconAnchor: [36, 38]
  });
}

function budgetIcon(property) {
  return L.divIcon({
    className: "property-div-icon", html: makeMarker(property).outerHTML,
    iconSize: [86, 58], iconAnchor: [43, 70]
  });
}

function startArchitecturalFallback() {
  renderer = "leaflet";
  document.body.classList.add("architectural-mode");
  document.querySelector("#map").classList.add("leaflet-mode", "architectural-tilt");
  modeLabel.textContent = "Architectural 3D · Exact locations";
  activeMap = L.map("map", { zoomControl: false, minZoom: 12, maxZoom: 20 }).setView([CENTER[1], CENTER[0]], 14);
  L.control.zoom({ position: "bottomright" }).addTo(activeMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20, attribution: "© OpenStreetMap contributors"
  }).addTo(activeMap);
  properties.forEach((property) => {
    const latLng = [property.coordinates[1], property.coordinates[0]];
    const color = property.type === "Plot" ? "#149379" : "#df7042";
    L.circle(latLng, {
      radius: 70, color: "#ffffff", weight: 3,
      fillColor: color, fillOpacity: 0.2, interactive: false
    }).addTo(activeMap);
    L.marker(latLng, { icon: siteIcon(property), interactive: false, zIndexOffset: 200 }).addTo(activeMap);
    L.marker(latLng, { icon: budgetIcon(property), zIndexOffset: 500 }).addTo(activeMap)
      .on("click", () => {
        activeMap.flyTo(latLng, 18, { duration: 1 });
        openDetails(property);
      });
  });
  finishLoading();
}

try {
  if (maplibregl.supported({ failIfMajorPerformanceCaveat: false })) start3D();
  else startArchitecturalFallback();
} catch (error) {
  document.querySelector("#map").replaceChildren();
  startArchitecturalFallback();
}

function resetView() {
  if (renderer === "maplibre") {
    activeMap.flyTo({
      center: CENTER, zoom: 13.25,
      pitch: threeDimensional ? 64 : 0,
      bearing: threeDimensional ? -24 : 0, duration: 1200
    });
  } else {
    activeMap.flyTo([CENTER[1], CENTER[0]], 14, { duration: 1 });
  }
}

viewToggle.onclick = () => {
  threeDimensional = !threeDimensional;
  viewToggle.classList.toggle("active", threeDimensional);
  viewToggle.setAttribute("aria-pressed", String(threeDimensional));
  viewToggle.innerHTML = threeDimensional ? "<span>◆</span> 3D view" : "<span>▦</span> Top view";
  if (renderer === "maplibre") {
    activeMap.easeTo({ pitch: threeDimensional ? 64 : 0, bearing: threeDimensional ? -24 : 0, duration: 900 });
  } else {
    document.querySelector("#map").classList.toggle("architectural-tilt", threeDimensional);
    window.setTimeout(() => activeMap.invalidateSize(), 350);
  }
};

document.querySelector("#reset").onclick = resetView;
document.querySelector("#recenter").onclick = resetView;
document.querySelector(".close").onclick = () => document.querySelector("#details").close();
document.querySelector("#details").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

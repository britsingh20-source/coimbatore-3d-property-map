import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { properties } from "./properties.js";

document.querySelector("#app").innerHTML = `
  <div id="map"></div>
  <div id="loading"><span></span><b>Loading Vadavalli 3D map…</b><small id="load-note">Loading roads and buildings</small></div>
  <header><div class="logo">CV</div><div><b>CoimbatoreVeedu</b><small>Vadavalli Property Map</small></div><button id="reset" aria-label="View all properties">⌖</button></header>
  <section class="summary"><b>Vadavalli · 7 km radius</b><small>${properties.length} properties available</small></section>
  <section class="legend"><b><i></i> Plot</b><b><i class="orange"></i> Villa</b></section>
  <dialog id="details"><button class="close" aria-label="Close">×</button><div id="detail-content"></div></dialog>
`;

const loading = document.querySelector("#loading");
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [76.9005, 11.029],
  zoom: 13.25,
  pitch: 60,
  bearing: -20,
  antialias: true,
  maxPitch: 85
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

const showProperty = (property) => {
  map.flyTo({ center: property.coordinates, zoom: 17, pitch: 68, bearing: -28, duration: 1400 });
  document.querySelector("#detail-content").innerHTML = `
    <div class="detail-head"><span>${property.type}</span><strong>${property.price}</strong><small>⌖ ${property.address}</small></div>
    <div class="detail-body"><h2>${property.title}</h2><div class="specs">
      <p><small>Property size</small><b>${property.size}</b></p><p><small>Facing</small><b>${property.facing}</b></p>
      <p><small>Approval</small><b>${property.approval}</b></p><p><small>Approach road</small><b>${property.road}</b></p>
    </div><ul>${property.features.map(x => `<li>✓ ${x}</li>`).join("")}</ul><button class="enquire">View full property details →</button></div>`;
  document.querySelector("#details").showModal();
};

map.on("load", () => {
  const layers = map.getStyle().layers || [];
  const label = layers.find(layer => layer.type === "symbol" && layer.layout?.["text-field"])?.id;
  if (!layers.some(layer => layer.type === "fill-extrusion")) {
    try {
      map.addLayer({ id:"property-3d-buildings", source:"openmaptiles", "source-layer":"building", minzoom:14, type:"fill-extrusion",
        paint:{ "fill-extrusion-color":["interpolate",["linear"],["coalesce",["get","render_height"],8],0,"#ddd8cc",30,"#b6ab9c"], "fill-extrusion-height":["coalesce",["get","render_height"],["get","height"],8], "fill-extrusion-base":["coalesce",["get","render_min_height"],0], "fill-extrusion-opacity":0.86 } }, label);
    } catch (error) { console.info("Using available map building layer", error); }
  }
  properties.forEach(property => {
    const marker = document.createElement("button");
    marker.className = property.type === "Plot" ? "marker" : "marker villa";
    marker.innerHTML = `<strong>${property.price}</strong><small>${property.type}</small>`;
    marker.onclick = () => showProperty(property);
    new maplibregl.Marker({ element: marker, anchor: "bottom" }).setLngLat(property.coordinates).addTo(map);
  });
  loading.classList.add("hidden");
});
map.on("error", event => {
  if (!map.loaded()) {
    document.querySelector("#load-note").textContent = "Map connection is taking longer than expected. Please refresh once.";
  }
});
document.querySelector("#reset").onclick = () => map.flyTo({ center:[76.9005,11.029], zoom:13.25, pitch:60, bearing:-20, duration:1200 });
document.querySelector(".close").onclick = () => document.querySelector("#details").close();

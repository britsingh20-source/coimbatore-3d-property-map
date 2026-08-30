import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { properties } from "./properties.js";

document.querySelector("#app").innerHTML = `
  <div id="map"></div>
  <div id="loading"><span></span><b>Loading Vadavalli property map…</b><small id="load-note">Loading roads and buildings</small></div>
  <header><div class="logo">CV</div><div><b>CoimbatoreVeedu</b><small id="map-mode">Vadavalli Property Map</small></div><button id="reset" aria-label="View all properties">⌖</button></header>
  <section class="summary"><b>Vadavalli · 7 km radius</b><small>${properties.length} properties available</small></section>
  <section class="legend"><b><i></i> Plot</b><b><i class="orange"></i> Villa</b></section>
  <dialog id="details"><button class="close" aria-label="Close">×</button><div id="detail-content"></div></dialog>
`;

const loading = document.querySelector("#loading");
let activeMap;
let is3D = false;

const openDetails = property => {
  document.querySelector("#detail-content").innerHTML = `
    <div class="detail-head"><span>${property.type}</span><strong>${property.price}</strong><small>⌖ ${property.address}</small></div>
    <div class="detail-body"><h2>${property.title}</h2><div class="specs">
      <p><small>Property size</small><b>${property.size}</b></p><p><small>Facing</small><b>${property.facing}</b></p>
      <p><small>Approval</small><b>${property.approval}</b></p><p><small>Approach road</small><b>${property.road}</b></p>
    </div><ul>${property.features.map(x => `<li>✓ ${x}</li>`).join("")}</ul><button class="enquire">View full property details →</button></div>`;
  document.querySelector("#details").showModal();
};

const makeMarker = property => {
  const marker = document.createElement("button");
  marker.className = property.type === "Plot" ? "marker" : "marker villa";
  marker.innerHTML = `<strong>${property.price}</strong><small>${property.type}</small>`;
  marker.setAttribute("aria-label", `Open ${property.title}`);
  return marker;
};

function start3D() {
  is3D = true;
  activeMap = new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/liberty",center:[76.9005,11.029],zoom:13.25,pitch:60,bearing:-20,antialias:true,maxPitch:85});
  activeMap.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"bottom-right");
  activeMap.on("load",()=>{
    const layers=activeMap.getStyle().layers||[];
    const label=layers.find(layer=>layer.type==="symbol"&&layer.layout?.["text-field"])?.id;
    if(!layers.some(layer=>layer.type==="fill-extrusion")){
      try{activeMap.addLayer({id:"property-3d-buildings",source:"openmaptiles","source-layer":"building",minzoom:14,type:"fill-extrusion",paint:{"fill-extrusion-color":"#c9c1b4","fill-extrusion-height":["coalesce",["get","render_height"],["get","height"],8],"fill-extrusion-base":["coalesce",["get","render_min_height"],0],"fill-extrusion-opacity":0.86}},label)}catch{}
    }
    properties.forEach(property=>{const marker=makeMarker(property);marker.onclick=()=>{activeMap.flyTo({center:property.coordinates,zoom:17,pitch:68,bearing:-28,duration:1400});openDetails(property)};new maplibregl.Marker({element:marker,anchor:"bottom"}).setLngLat(property.coordinates).addTo(activeMap)});
    loading.classList.add("hidden");
  });
}

function startCompatibleMap() {
  document.querySelector("#map-mode").textContent="Vadavalli Exact Map · Compatibility Mode";
  document.querySelector("#map").classList.add("leaflet-mode");
  activeMap=L.map("map",{zoomControl:false}).setView([11.029,76.9005],14);
  L.control.zoom({position:"bottomright"}).addTo(activeMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,attribution:"© OpenStreetMap contributors"}).addTo(activeMap);
  properties.forEach(property=>{
    const marker=makeMarker(property);
    marker.onclick=()=>{activeMap.flyTo([property.coordinates[1],property.coordinates[0]],18,{duration:1});openDetails(property)};
    L.marker([property.coordinates[1],property.coordinates[0]],{icon:L.divIcon({className:"property-div-icon",html:marker.outerHTML,iconSize:[80,52],iconAnchor:[40,52]})}).addTo(activeMap).on("click",()=>{activeMap.flyTo([property.coordinates[1],property.coordinates[0]],18,{duration:1});openDetails(property)});
  });
  loading.classList.add("hidden");
}

try {
  if (maplibregl.supported({failIfMajorPerformanceCaveat:false})) start3D();
  else startCompatibleMap();
} catch (error) {
  document.querySelector("#map").replaceChildren();
  startCompatibleMap();
}

document.querySelector("#reset").onclick=()=>is3D?activeMap.flyTo({center:[76.9005,11.029],zoom:13.25,pitch:60,bearing:-20,duration:1200}):activeMap.flyTo([11.029,76.9005],14,{duration:1});
document.querySelector(".close").onclick=()=>document.querySelector("#details").close();

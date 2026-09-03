import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { properties } from "./properties.js";

const API_BASE = window.LEAD_API_BASE || "";
const absoluteMediaUrl = (url) => url?.startsWith("/api/") ? API_BASE + url : url;
const startupToken = localStorage.getItem("crm-telecaller-session-token") || "";
const catalogCacheKey = startupToken ? "published-property-catalog-internal" : "published-property-catalog-public";
try {
  localStorage.removeItem("published-property-catalog");
  const cached = JSON.parse(localStorage.getItem(catalogCacheKey) || "null");
  if (Array.isArray(cached) && cached.length) properties.splice(0, properties.length, ...cached);
} catch (error) {
  console.info("Could not read the cached property catalog.", error);
}
if (!startupToken) properties.forEach((property) => {
  if (property.exactLocation === false) return;
  let hash = 0;
  for (const char of String(property.id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const distance = 450 + (hash % 101), bearing = (hash % 360) * Math.PI / 180;
  const [lng, lat] = property.coordinates;
  property.coordinates = [lng + (distance * Math.sin(bearing)) / (111320 * Math.max(.2, Math.cos(lat * Math.PI / 180))), lat + (distance * Math.cos(bearing)) / 111320];
  property.exactLocation = false;
  property.locationAccuracy = "approximate_500m";
});
fetch(API_BASE + "/api/properties", { headers: startupToken ? { Authorization: "Bearer " + startupToken } : {} }).then((response) => response.ok ? response.json() : null).then((data) => {
  if (!Array.isArray(data?.properties) || !data.properties.length) return;
  const catalog = data.properties.map((property) => ({
    ...property,
    tour: (property.tour || []).map((photo) => ({ ...photo, url: absoluteMediaUrl(photo.url) }))
  }));
  const serialized = JSON.stringify(catalog);
  if (localStorage.getItem(catalogCacheKey) !== serialized) {
    localStorage.setItem(catalogCacheKey, serialized);
    window.location.reload();
  }
}).catch((error) => console.info("Published property catalog is temporarily unavailable.", error));

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
  '<header><div class="logo">CV</div><div><b>CoimbatoreVeedu</b><small id="map-mode">Vadavalli 3D Property Map</small></div><button id="admin-open" aria-label="Open admin panel" title="Admin panel">♙</button></header>',
  '<section class="summary"><b>Vadavalli · 7 km radius</b><small>' + properties.length + ' properties available</small></section>',
  '<form id="location-search" role="search"><span>⌕</span><input id="location-query" type="search" placeholder="Search Somayampalayam, Kalapatti…" aria-label="Search a location in Coimbatore" autocomplete="off"><button type="submit">Search</button><div id="search-results" hidden></div></form>',
  '<nav class="view-controls" aria-label="Map view"><button id="view-toggle" class="active" aria-pressed="true"><span>◆</span> 3D view</button><button id="recenter" aria-label="Recenter map">⌖</button></nav>',
  '<section class="legend"><b><i></i> Plot</b><b><i class="orange"></i> Villa</b><small>Tap a budget pin</small></section>',
  '<dialog id="details"><button class="close" aria-label="Close">×</button><div id="detail-content"></div></dialog>',
  '<aside id="admin-panel" class="admin-shell" hidden>',
    '<div class="admin-topbar"><div class="panel-tabs"><button id="customer-panel-tab">Customer Panel</button><button class="active">Admin Panel</button></div><button id="admin-close" aria-label="Close admin panel">×</button></div>',
    '<div class="admin-layout">',
      '<section class="admin-sidebar"><div class="admin-profile"><div class="admin-avatar">AD</div><div><b id="admin-person-name">Administrator</b><small>Property manager</small></div></div>',
        '<nav class="admin-segments" aria-label="Admin sections"><button class="active" data-admin-section="overview"><span>⌂</span>Overview</button><button data-admin-section="properties"><span>▦</span>Properties</button><button data-admin-section="editor"><span>✎</span>Editor</button></nav>',
      '</section>',
      '<main class="admin-content">',
        '<section id="admin-overview" class="admin-section active"><div class="admin-heading"><div><small>ADMIN PANEL</small><h2>Property workspace</h2></div><span>' + properties.length + ' live properties</span></div>',
          '<div class="admin-actions"><button data-admin-action="editor"><i>＋</i><b>Update Property</b><small>Add a property, specifications and tour images</small></button><button data-admin-action="properties"><i>✎</i><b>Edit Existing Property</b><small>Select and modify a published property</small></button><button data-admin-action="editor"><i>▧</i><b>Property Images</b><small>Elevation, interiors, parking and portico</small></button><button data-admin-action="properties"><i>⌖</i><b>Location Pins</b><small>Review the exact map coordinates</small></button></div>',
        '</section>',
        '<section id="admin-properties" class="admin-section"><div class="admin-heading"><div><small>PROPERTY LIBRARY</small><h2>Edit existing property</h2></div><button class="compact-add" data-admin-action="editor">＋ Add</button></div><div class="admin-property-list">' +
          properties.map((property) => '<article><div class="property-mini-icon">' + (property.type === "Plot" ? "▱" : "⌂") + '</div><div><b>' + property.title + '</b><small>' + property.address + ' · ' + property.price + '</small></div><button data-edit-property="' + property.id + '">Edit ✎</button></article>').join("") +
        '</div></section>',
        '<section id="admin-editor" class="admin-section"><div class="admin-heading"><div><small>PROPERTY EDITOR</small><h2 id="editor-title">Update property</h2></div><button class="editor-back" data-admin-action="overview">← Back</button></div>',
          '<form id="property-editor-form"><div class="admin-form-grid"><label>Property title<input name="title" required placeholder="Example: Vadavalli 3 BHK Villa"></label><label>Property type<select name="type"><option>Plot</option><option>Villa</option></select></label><label class="villa-only">Bedrooms<input name="bedrooms" placeholder="3 BHK"></label><label>Location<input name="address" required placeholder="Area, locality, Coimbatore"></label><label>Price<input name="price" required placeholder="₹58 L"></label><label>Land area<input name="landArea" placeholder="4.2 cents · 1,830 sq.ft."></label><label class="villa-only">Building area<input name="builtUpArea" placeholder="1,650 sq.ft."></label><label>Facing<input name="facing" placeholder="North"></label><label>Approval<input name="approval" placeholder="DTCP / Plan approved"></label><label>Road width<input name="road" placeholder="30 ft road"></label><label>Coordinates<input name="coordinates" required placeholder="Latitude, Longitude from Google Maps"></label><label class="form-wide">Amenities / features<input name="features" placeholder="Park, Water, Street lights (comma separated)"></label></div>',
            '<fieldset id="director-contact-fields" class="director-contact-fields" hidden><legend>Director-only contacts</legend><p>These numbers are protected and are never shown to customers, telecallers, Managers or Administrators.</p><div class="admin-form-grid"><label>Property owner name<input name="owner_name" placeholder="Owner name"></label><label>Property owner number<input name="owner_phone" inputmode="tel" placeholder="+91 98765 43210"></label><label>Property manager name<input name="manager_name" placeholder="Manager name"></label><label>Property manager number<input name="manager_phone" inputmode="tel" placeholder="+91 98765 43210"></label><label>Builder name<input name="builder_name" placeholder="Builder name"></label><label>Builder number<input name="builder_phone" inputmode="tel" placeholder="+91 98765 43210"></label></div></fieldset>',
            '<div class="admin-media"><div><b>Property gallery</b><small id="media-help">Front Poster / Rate Card is required. Tap any box to choose from your gallery.</small></div><div id="media-slots" class="media-slots"></div></div>',
            '<p id="admin-save-notice" hidden></p><div class="editor-actions"><button type="button" data-admin-action="overview">Cancel</button><button id="property-save-button" type="submit">Save Property</button></div>',
          '</form>',
        '</section>',
      '</main>',
    '</div>',
  '</aside>'
].join("");

const loading = document.querySelector("#loading");
const modeLabel = document.querySelector("#map-mode");
const viewToggle = document.querySelector("#view-toggle");
let activeMap;
let renderer = "maplibre";
let threeDimensional = true;
let searchMarker;

const defaultTour = [
  { label: "Elevation", scene: "elevation" },
  { label: "Hall", scene: "hall" },
  { label: "Bedroom", scene: "bedroom" },
  { label: "Car Parking", scene: "parking" },
  { label: "Portico", scene: "portico" }
];

function tourSlide(photo, index) {
  const visual = photo.url
    ? '<img src="' + photo.url + '" alt="' + (photo.alt || photo.label) + '" loading="lazy">'
    : '<div class="holo-placeholder scene-' + (photo.scene || "room") + '"><div class="holo-grid"></div><div class="holo-object"><i></i><i></i><i></i></div><small>Photo slot ready</small></div>';
  return '<figure class="holo-slide' + (index === 0 ? " active" : "") + '" data-slide="' + index + '">' +
    visual + '<figcaption><b>' + photo.label + '</b><span>Property tour</span></figcaption></figure>';
}

function openDetails(property) {
  const tour = property.tour?.length ? property.tour : defaultTour;
  document.querySelector("#detail-content").innerHTML = [
    '<section class="hologram-tour"><div class="holo-title"><span>◈ HOLOGRAM TOUR</span><small>Swipe through property spaces</small></div>',
    '<div class="holo-stage">', tour.map(tourSlide).join(""),
    '<button class="tour-arrow previous" aria-label="Previous image">‹</button><button class="tour-arrow next" aria-label="Next image">›</button></div>',
    '<div class="tour-thumbs">', tour.map((photo, index) => '<button class="' + (index === 0 ? "active" : "") + '" data-tour="' + index + '">' + photo.label + '</button>').join(""), '</div></section>',
    '<div class="detail-head"><span>', property.type, '</span><strong>', property.price,
    '</strong><small>⌖ ', property.address, '</small></div><div class="detail-body"><h2>',
    property.title, '</h2><div class="specs"><p><small>Land area</small><b>', property.landArea || property.size,
    '</b></p><p><small>Building area</small><b>', property.builtUpArea || (property.type === "Plot" ? "Not applicable" : "Not provided"),
    '</b></p><p><small>Facing</small><b>', property.facing,
    '</b></p><p><small>Approval</small><b>', property.approval,
    '</b></p><p><small>Approach road</small><b>', property.road,
    '</b></p></div><ul>', property.features.map((feature) => '<li>✓ ' + feature + '</li>').join(""),
    '</ul><button class="enquire">Schedule a site visit →</button>',
    '<p class="location-note">', property.exactLocation ? 'Exact site location is visible to authorised staff.' : 'Customer privacy view: this pin shows only the approximate locality within about 500 metres. Contact us for a guided site visit.', '</p></div>'
  ].join("");
  document.querySelector("#details").showModal();
  let currentSlide = 0;
  const showSlide = (next) => {
    currentSlide = (next + tour.length) % tour.length;
    document.querySelectorAll(".holo-slide").forEach((slide, index) => slide.classList.toggle("active", index === currentSlide));
    document.querySelectorAll("[data-tour]").forEach((button, index) => button.classList.toggle("active", index === currentSlide));
  };
  document.querySelector(".tour-arrow.previous").onclick = () => showSlide(currentSlide - 1);
  document.querySelector(".tour-arrow.next").onclick = () => showSlide(currentSlide + 1);
  document.querySelectorAll("[data-tour]").forEach((button) => {
    button.onclick = () => showSlide(Number(button.dataset.tour));
  });
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

function placeSearchPin(coordinates, label) {
  if (searchMarker) searchMarker.remove();
  const pin = document.createElement("div");
  pin.className = "search-location-pin";
  pin.innerHTML = '<span>⌖</span><b>' + label + '</b>';
  if (renderer === "maplibre") {
    searchMarker = new maplibregl.Marker({ element: pin, anchor: "bottom" })
      .setLngLat(coordinates).addTo(activeMap);
  } else {
    searchMarker = L.marker([coordinates[1], coordinates[0]], {
      icon: L.divIcon({ className: "search-pin-wrapper", html: pin.outerHTML, iconSize: [180, 55], iconAnchor: [90, 55] }),
      zIndexOffset: 900
    }).addTo(activeMap);
  }
}

function goToLocation(coordinates, label) {
  placeSearchPin(coordinates, label);
  if (renderer === "maplibre") {
    activeMap.flyTo({ center: coordinates, zoom: 15.8, pitch: threeDimensional ? 60 : 0, duration: 1300 });
  } else {
    activeMap.flyTo([coordinates[1], coordinates[0]], 16, { duration: 1 });
  }
  const searchInput = document.querySelector("#location-query");
  searchInput.value = label;
  searchInput.blur();
  document.querySelector("#search-results").hidden = true;
}

function resultButton(label, subtitle, coordinates, propertyId = "") {
  return '<button type="button" data-lng="' + coordinates[0] + '" data-lat="' + coordinates[1] +
    '" data-label="' + label.replaceAll('"', "&quot;") + '" data-property="' + propertyId + '"><span>⌖</span><b>' +
    label + '</b><small>' + subtitle + '</small></button>';
}

async function searchLocation(query) {
  const results = document.querySelector("#search-results");
  const normalized = query.trim().toLowerCase();
  const localMatches = properties.filter((property) =>
    (property.title + " " + property.address).toLowerCase().includes(normalized)
  );
  results.hidden = false;
  results.innerHTML = '<div class="searching"><i></i> Finding exact location…</div>';

  let remoteMatches = [];
  try {
    const params = new URLSearchParams({
      q: query + ", Coimbatore, Tamil Nadu",
      limit: "4",
      lang: "en",
      countrycode: "IN",
      bbox: "76.70,10.80,77.20,11.30"
    });
    const response = await fetch("https://photon.komoot.io/api/?" + params);
    if (!response.ok) throw new Error("Location search unavailable");
    const data = await response.json();
    remoteMatches = (data.features || []).map((feature) => {
      const info = feature.properties || {};
      const label = info.name || info.street || info.district || "Coimbatore location";
      const subtitle = [info.district, info.city, info.state].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(", ");
      return { label, subtitle: subtitle || "Coimbatore, Tamil Nadu", coordinates: feature.geometry.coordinates };
    });
  } catch (error) {
    console.info("Online geocoder unavailable; property search remains active.", error);
  }

  const localHtml = localMatches.map((property) =>
    resultButton(property.address, property.title + " · " + property.price, property.coordinates, property.id)
  );
  const seen = new Set(localMatches.map((property) => property.address.toLowerCase()));
  const remoteHtml = remoteMatches
    .filter((place) => {
      const key = (place.label + "|" + place.subtitle).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((place) => resultButton(place.label, place.subtitle, place.coordinates));
  const visibleResults = localHtml.concat(remoteHtml).slice(0, 3);
  results.innerHTML = visibleResults.join("") ||
    '<div class="no-results"><b>No exact match found</b><small>Try the area, street or landmark name.</small></div>';

  results.querySelectorAll("button").forEach((button) => {
    button.onclick = () => {
      const coordinates = [Number(button.dataset.lng), Number(button.dataset.lat)];
      goToLocation(coordinates, button.dataset.label);
      const property = properties.find((item) => item.id === button.dataset.property);
      if (property) window.setTimeout(() => openDetails(property), 550);
    };
  });
}

try {
  if (maplibregl.supported({ failIfMajorPerformanceCaveat: false })) start3D();
  else startArchitecturalFallback();
} catch (error) {
  document.querySelector("#map").replaceChildren();
  startArchitecturalFallback();
}

document.querySelector("#location-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.querySelector("#location-query").value.trim();
  if (query.length >= 2) searchLocation(query);
});

document.querySelector("#location-query").addEventListener("input", (event) => {
  if (!event.target.value.trim()) document.querySelector("#search-results").hidden = true;
});

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

document.querySelector("#recenter").onclick = resetView;
document.querySelector(".close").onclick = () => document.querySelector("#details").close();
document.querySelector("#details").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

const adminPanel = document.querySelector("#admin-panel");
function showAdminSection(sectionName) {
  document.querySelectorAll(".admin-section").forEach((section) => {
    section.classList.toggle("active", section.id === "admin-" + sectionName);
  });
  document.querySelectorAll("[data-admin-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminSection === sectionName);
  });
  document.querySelector(".admin-content").scrollTop = 0;
}

function closeAdminPanel() {
  adminPanel.hidden = true;
  document.body.classList.remove("admin-mode");
}

document.querySelector("#admin-open").onclick = () => {
  adminPanel.hidden = false;
  document.body.classList.add("admin-mode");
  window.setTimeout(updateContactVisibility, 0);
  showAdminSection("overview");
};
document.querySelector("#admin-close").onclick = closeAdminPanel;
document.querySelector("#customer-panel-tab").onclick = closeAdminPanel;

document.querySelectorAll("[data-admin-section]").forEach((button) => {
  button.onclick = () => showAdminSection(button.dataset.adminSection);
});
document.querySelectorAll("[data-admin-action]").forEach((button) => {
  button.onclick = () => {
    if (button.dataset.adminAction === "editor" && button.classList.contains("compact-add")) resetPropertyEditor();
    showAdminSection(button.dataset.adminAction);
  };
});
const MEDIA_SLOTS = {
  Plot: ["Front Poster", "Plot / Site", "Road Access", "Amenities", "Layout / Approval", "Location View", "Rate Card"],
  Villa: ["Front Poster", "Elevation", "Hall", "Bedroom", "Kitchen", "Car Parking", "Portico", "Amenities"]
};
const editorForm = document.querySelector("#property-editor-form");
const selectedMedia = new Map();
let editingPropertyId = "";
let existingTour = [];
const isDirector = () => String(window.CRM_SESSION?.role?.() || window.CRM_SESSION?.user?.() || "").toLowerCase() === "director";
function updateContactVisibility() { document.querySelector("#director-contact-fields").hidden = !isDirector(); }

function renderMediaSlots() {
  const kind = editorForm.elements.type.value;
  document.querySelectorAll(".villa-only").forEach((field) => field.hidden = kind !== "Villa");
  document.querySelector("#media-help").textContent = kind === "Plot"
    ? "Front Poster / Rate Card is required. Add plot, road, amenities and layout images."
    : "Front-view poster is required. Add elevation, room, parking and amenity images.";
  const current = new Map(existingTour.map((photo) => [photo.label, photo]));
  document.querySelector("#media-slots").innerHTML = MEDIA_SLOTS[kind].map((slot) => {
    const photo = selectedMedia.get(slot) || current.get(slot);
    const preview = photo ? '<img src="' + (photo.preview || photo.url) + '" alt="' + slot + ' preview">' : '<i>＋</i>';
    return '<label class="media-slot' + (photo ? ' selected' : '') + '">' + preview + '<span>' + slot + (slot === "Front Poster" ? " *" : "") + '</span><input type="file" accept="image/*" data-media-slot="' + slot + '"></label>';
  }).join("");
  document.querySelectorAll("[data-media-slot]").forEach((input) => input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const old = selectedMedia.get(input.dataset.mediaSlot);
    if (old?.preview) URL.revokeObjectURL(old.preview);
    selectedMedia.set(input.dataset.mediaSlot, { file, preview: URL.createObjectURL(file) });
    renderMediaSlots();
  });
}

function resetPropertyEditor() {
  editorForm.reset();
  editingPropertyId = "";
  existingTour = [];
  selectedMedia.clear();
  document.querySelector("#editor-title").textContent = "Add property";
  document.querySelector("#admin-save-notice").hidden = true;
  renderMediaSlots();
  updateContactVisibility();
}
async function prepareImage(file) {
  if (file.size <= 350000) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob) throw new Error("Image preparation failed");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}
editorForm.elements.type.addEventListener("change", renderMediaSlots);
renderMediaSlots();
document.querySelectorAll("[data-edit-property]").forEach((button) => {
  button.onclick = async () => {
    const property = properties.find((item) => item.id === button.dataset.editProperty);
    if (!property) return;
    selectedMedia.clear();
    editingPropertyId = property.id;
    existingTour = property.tour || [];
    ["title", "bedrooms", "address", "price", "landArea", "builtUpArea", "facing", "approval", "road"].forEach((field) => {
      if (editorForm.elements[field]) editorForm.elements[field].value = property[field] || "";
    });
    editorForm.elements.type.value = property.type === "Plot" ? "Plot" : "Villa";
    editorForm.elements.features.value = (property.features || []).join(", ");
    editorForm.elements.coordinates.value = property.coordinates[1] + ", " + property.coordinates[0];
    document.querySelector("#editor-title").textContent = "Edit " + property.title;
    document.querySelector("#admin-save-notice").hidden = true;
    renderMediaSlots();
    updateContactVisibility();
    if (isDirector()) {
      try {
        const token = window.CRM_SESSION?.token?.() || localStorage.getItem("crm-telecaller-session-token") || "";
        const response = await fetch(API_BASE + "/api/properties/" + encodeURIComponent(property.id) + "/contacts", { headers: { Authorization: "Bearer " + token } });
        const data = await response.json();
        if (response.ok) (data.contacts || []).forEach((contact) => {
          if (editorForm.elements[contact.contact_type + "_name"]) editorForm.elements[contact.contact_type + "_name"].value = contact.contact_name || "";
          if (editorForm.elements[contact.contact_type + "_phone"]) editorForm.elements[contact.contact_type + "_phone"].value = contact.contact_phone || "";
        });
      } catch (error) { console.info("Director contact details could not be loaded.", error); }
    }
    showAdminSection("editor");
  };
});
editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const notice = document.querySelector("#admin-save-notice");
  const submit = document.querySelector("#property-save-button");
  const hasPoster = selectedMedia.has("Front Poster") || existingTour.some((photo) => photo.label === "Front Poster");
  notice.hidden = false;
  if (!hasPoster) { notice.className = "error"; notice.textContent = "Please select the required Front Poster image."; return; }
  const formData = new FormData(editorForm);
  if (!isDirector()) ["owner_name","owner_phone","manager_name","manager_phone","builder_name","builder_phone"].forEach((field) => formData.delete(field));
  if (editingPropertyId) formData.set("id", editingPropertyId);
  for (const [slot, media] of selectedMedia) {
    const file = await prepareImage(media.file);
    formData.set("image_" + slot, file, file.name);
  }
  const token = window.CRM_SESSION?.token?.() || localStorage.getItem("crm-telecaller-session-token") || "";
  submit.disabled = true;
  submit.textContent = "Uploading…";
  notice.className = "";
  notice.textContent = "Uploading images and saving the property. Please keep this page open.";
  try {
    const response = await fetch(API_BASE + "/api/properties", { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not save property");
    notice.className = "success";
    notice.textContent = "Property and gallery saved successfully. Refreshing…";
    window.setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    notice.className = "error";
    notice.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Property";
  }
});

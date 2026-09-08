const API_BASE = window.LEAD_API_BASE || "";

function normalize(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function getPublicCatalog() {
  const response = await fetch(API_BASE + "/api/properties", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load customer locations");
  const data = await response.json();
  return Array.isArray(data?.properties) ? data.properties : [];
}

function currentDetailsIdentity() {
  const root = document.querySelector("#detail-content");
  if (!root) return null;
  const title = root.querySelector(".detail-body h2")?.textContent || "";
  const price = root.querySelector(".detail-head strong")?.textContent || "";
  const address = root.querySelector(".detail-head small")?.textContent?.replace(/^\s*⌖\s*/, "") || "";
  if (!title) return null;
  return { title: normalize(title), price: normalize(price), address: normalize(address) };
}

function findPublicProperty(catalog, identity) {
  if (!identity) return null;
  const titleMatches = catalog.filter((property) => normalize(property.title) === identity.title);
  if (titleMatches.length === 1) return titleMatches[0];
  return titleMatches.find((property) => normalize(property.price) === identity.price)
    || titleMatches.find((property) => normalize(property.address) === identity.address)
    || null;
}

function destinationValues(coordinates) {
  const [lng, lat] = (coordinates || []).map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, value: lat + "," + lng };
}

function googleMapsWebUrl(destination) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination.value) + "&travelmode=driving";
}

function googleMapsIosUrl(destination) {
  return "comgooglemaps://?daddr=" + encodeURIComponent(destination.value) + "&directionsmode=driving";
}

function openCustomerDestination(destination) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webUrl = googleMapsWebUrl(destination);
  if (!isIOS) {
    window.open(webUrl, "_blank", "noopener");
    return;
  }

  // On iPhone, opening the normal HTTPS directions URL can hand off to Google Maps
  // without preserving the destination. Use the Google Maps app scheme first.
  const started = Date.now();
  window.location.href = googleMapsIosUrl(destination);
  window.setTimeout(() => {
    // If Google Maps is not installed, the page remains active; fall back to the
    // official Google Maps web directions URL with the same customer destination.
    if (document.visibilityState === "visible" && Date.now() - started < 1800) {
      window.location.href = webUrl;
    }
  }, 900);
}

async function prepareCustomerNavigation() {
  const dialog = document.querySelector("#details");
  const actions = document.querySelector("#detail-content .property-actions");
  if (!dialog?.open || !actions) return;

  const identity = currentDetailsIdentity();
  if (!identity) return;

  let button = actions.querySelector(".navigate-customer-location");
  if (!button) {
    button = document.createElement("a");
    button.className = "navigate-customer-location";
    button.textContent = "📍 Navigate";
    button.setAttribute("aria-label", "Navigate to customer meeting location");
    actions.prepend(button);
  }

  let note = document.querySelector("#detail-content .customer-navigation-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "customer-navigation-note";
    actions.insertAdjacentElement("afterend", note);
  }

  try {
    // Intentionally call the public catalog WITHOUT an Authorization header.
    // This guarantees that Navigate can only receive customer-safe coordinates.
    const property = findPublicProperty(await getPublicCatalog(), identity);
    const destination = destinationValues(property?.coordinates);
    if (!property || !destination) throw new Error("Customer location unavailable");

    button.href = googleMapsWebUrl(destination);
    button.removeAttribute("target");
    button.removeAttribute("rel");
    button.dataset.state = "ready";
    button.textContent = "📍 Navigate";
    button.title = property.address ? "Navigate to " + property.address : "Navigate to customer meeting location";
    button.onclick = (event) => {
      event.preventDefault();
      openCustomerDestination(destination);
    };
    note.textContent = "Navigate opens the customer location you selected. The exact property location remains private.";
  } catch (error) {
    button.href = "#";
    button.dataset.state = "error";
    button.textContent = "📍 Location unavailable";
    button.removeAttribute("target");
    button.onclick = (event) => event.preventDefault();
    note.textContent = "Customer navigation location is not available for this property yet. Please update the Customer Location in the property editor.";
    console.info("Customer navigation could not be prepared.", error);
  }
}

const observer = new MutationObserver(() => window.setTimeout(prepareCustomerNavigation, 0));
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
document.addEventListener("click", () => window.setTimeout(prepareCustomerNavigation, 40), true);
window.addEventListener("pageshow", () => window.setTimeout(prepareCustomerNavigation, 100));

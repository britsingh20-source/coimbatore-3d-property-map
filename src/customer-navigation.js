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

function googleMapsDirectionsUrl(coordinates) {
  const [lng, lat] = coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(lat + "," + lng);
}

async function installNavigationAction() {
  const dialog = document.querySelector("#details");
  const actions = document.querySelector("#detail-content .property-actions");
  if (!dialog?.open || !actions || actions.querySelector(".navigate-customer-location")) return;

  const identity = currentDetailsIdentity();
  if (!identity) return;

  const button = document.createElement("a");
  button.className = "navigate-customer-location";
  button.textContent = "📍 Navigate";
  button.setAttribute("aria-label", "Navigate to customer meeting location");
  button.href = "#";
  button.dataset.state = "loading";
  actions.prepend(button);

  const note = document.createElement("p");
  note.className = "customer-navigation-note";
  note.textContent = "Navigation opens the customer meeting location you selected. Contact us for the exact property site visit.";
  actions.insertAdjacentElement("afterend", note);

  try {
    const property = findPublicProperty(await getPublicCatalog(), identity);
    const coordinates = property?.coordinates;
    const url = Array.isArray(coordinates) && coordinates.length === 2 ? googleMapsDirectionsUrl(coordinates) : "";
    if (!url) throw new Error("Customer location unavailable");
    button.href = url;
    button.target = "_blank";
    button.rel = "noopener";
    button.dataset.state = "ready";
    button.title = property.address ? "Navigate to " + property.address : "Navigate to customer meeting location";
  } catch (error) {
    button.dataset.state = "error";
    button.textContent = "📍 Location unavailable";
    button.removeAttribute("target");
    button.onclick = (event) => event.preventDefault();
    note.textContent = "Customer navigation location is not available for this property yet. Please contact us for the meeting point.";
    console.info("Customer navigation could not be prepared.", error);
  }
}

const observer = new MutationObserver(() => installNavigationAction());
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
document.addEventListener("click", () => window.setTimeout(installNavigationAction, 40), true);

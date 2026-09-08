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
  const [lng, lat] = (coordinates || []).map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(lat + "," + lng);
}

function buildShareText(property, mapsUrl) {
  const propertyLink = location.origin + location.pathname + "?property=" + encodeURIComponent(property.id);
  return [
    property.title,
    "Price: " + property.price,
    "Customer Location: " + property.address,
    mapsUrl ? "📍 Customer Location Map: " + mapsUrl : "",
    property.instagramUrl ? "Instagram video: " + property.instagramUrl : "",
    "Contact CoimbatoreVeedu Builders: 9003787621",
    "Property details: " + propertyLink
  ].filter(Boolean).join("\n");
}

function installSafeShare(property, mapsUrl) {
  const shareButton = document.querySelector("#detail-content .share-property");
  if (!shareButton) return;

  const shareText = buildShareText(property, mapsUrl);
  const whatsappShare = "https://wa.me/?text=" + encodeURIComponent(shareText);
  shareButton.dataset.customerLocationShare = "1";
  shareButton.onclick = async (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (navigator.share) {
      try {
        await navigator.share({ title: property.title, text: shareText });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    location.href = whatsappShare;
  };
}

async function prepareCustomerLocationActions() {
  const dialog = document.querySelector("#details");
  const actions = document.querySelector("#detail-content .property-actions");
  if (!dialog?.open || !actions) return;

  const identity = currentDetailsIdentity();
  if (!identity) return;

  try {
    const property = findPublicProperty(await getPublicCatalog(), identity);
    if (!property) throw new Error("Customer property unavailable");
    const url = Array.isArray(property.coordinates) && property.coordinates.length === 2 ? googleMapsDirectionsUrl(property.coordinates) : "";

    // Always replace the Share Property handler with the customer-safe payload,
    // even if the Navigate button was already inserted during an earlier render.
    installSafeShare(property, url);

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

    if (!url) {
      button.href = "#";
      button.dataset.state = "error";
      button.textContent = "📍 Location unavailable";
      button.removeAttribute("target");
      button.onclick = (event) => event.preventDefault();
      note.textContent = "Customer map coordinates are not available yet. Share Property will still use the customer location text and will never expose the exact site.";
      return;
    }

    button.href = url;
    button.target = "_blank";
    button.rel = "noopener";
    button.dataset.state = "ready";
    button.textContent = "📍 Navigate";
    button.title = property.address ? "Navigate to " + property.address : "Navigate to customer meeting location";
    note.textContent = "Navigation and Share Property use the customer location you selected. Contact us for the exact property site visit.";
  } catch (error) {
    console.info("Customer location actions could not be prepared.", error);
  }
}

const observer = new MutationObserver(() => window.setTimeout(prepareCustomerLocationActions, 0));
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
document.addEventListener("click", () => window.setTimeout(prepareCustomerLocationActions, 40), true);
window.addEventListener("pageshow", () => window.setTimeout(prepareCustomerLocationActions, 100));

const API_BASE = window.LEAD_API_BASE || "";

const reelCode = (url) => String(url || "").match(/instagram\.com\/(?:reel|p)\/([^/?#]+)/i)?.[1] || "";
const safeText = (value) => String(value || "").replace(/[<>&"]/g, (char) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[char]));

function propertyUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set("property", id);
  return url.toString();
}

function shareProperty(property) {
  const url = propertyUrl(property.id);
  const text = `${property.title}\nPrice: ${property.price}\nArea: ${property.address}\nContact CoimbatoreVeedu Builders: 9003787621`;
  if (navigator.share) {
    return navigator.share({ title: property.title, text, url }).catch((error) => {
      if (error?.name !== "AbortError") location.href = `https://wa.me/?text=${encodeURIComponent(`${text}\nProperty details: ${url}`)}`;
    });
  }
  location.href = `https://wa.me/?text=${encodeURIComponent(`${text}\nProperty details: ${url}`)}`;
}

async function loadCustomerReels() {
  const response = await fetch(`${API_BASE}/api/properties`);
  if (!response.ok) throw new Error(`Property catalog failed (${response.status})`);
  const data = await response.json();
  return (data.properties || []).filter((property) => reelCode(property.instagramUrl));
}

function card(property) {
  const code = reelCode(property.instagramUrl);
  return `<article class="customer-reel-card" data-reel-property="${safeText(property.id)}">
    <div class="customer-reel-player">
      <iframe src="https://www.instagram.com/reel/${encodeURIComponent(code)}/embed" title="${safeText(property.title)} Instagram Reel" loading="lazy" allowfullscreen></iframe>
    </div>
    <div class="customer-reel-info">
      <span>${safeText(property.type)}</span>
      <h3>${safeText(property.title)}</h3>
      <p><b>${safeText(property.price)}</b><small>⌖ ${safeText(property.address)}</small></p>
      <div>
        <a href="${safeText(propertyUrl(property.id))}">View Property</a>
        <button type="button" data-share-reel="${safeText(property.id)}">Share Property</button>
      </div>
    </div>
  </article>`;
}

function installCustomerReels() {
  if (document.querySelector("#customer-reels-open")) return;
  const header = document.querySelector("header");
  const adminButton = document.querySelector("#admin-open");
  if (!header || !adminButton) return setTimeout(installCustomerReels, 150);

  const button = document.createElement("button");
  button.id = "customer-reels-open";
  button.type = "button";
  button.title = "Property Reels";
  button.setAttribute("aria-label", "Open Instagram property Reels");
  button.innerHTML = "▶";
  header.insertBefore(button, adminButton);

  const panel = document.createElement("dialog");
  panel.id = "customer-reels-panel";
  panel.innerHTML = `<div class="customer-reels-head"><div><small>CUSTOMER PANEL</small><h2>Property Reels</h2><p>Watch our Instagram property videos and open the matching customer-safe property.</p></div><button type="button" aria-label="Close Reels">×</button></div><div id="customer-reels-list"><p class="customer-reels-loading">Loading property Reels…</p></div>`;
  document.body.appendChild(panel);

  const close = () => panel.close();
  panel.querySelector(".customer-reels-head>button").onclick = close;
  panel.addEventListener("click", (event) => { if (event.target === panel) close(); });
  button.onclick = async () => {
    panel.showModal();
    const list = panel.querySelector("#customer-reels-list");
    list.innerHTML = '<p class="customer-reels-loading">Loading property Reels…</p>';
    try {
      const properties = await loadCustomerReels();
      if (!properties.length) {
        list.innerHTML = '<div class="customer-reels-empty"><b>No property Reels linked yet</b><small>Add an Instagram Reel link in the property editor and it will appear here automatically.</small></div>';
        return;
      }
      list.innerHTML = properties.map(card).join("");
      list.querySelectorAll("[data-share-reel]").forEach((shareButton) => {
        shareButton.onclick = () => {
          const property = properties.find((item) => item.id === shareButton.dataset.shareReel);
          if (property) shareProperty(property);
        };
      });
    } catch (error) {
      list.innerHTML = `<div class="customer-reels-empty"><b>Reels are temporarily unavailable</b><small>${safeText(error.message)}</small></div>`;
    }
  };
}

installCustomerReels();

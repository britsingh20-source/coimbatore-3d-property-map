import "./property-location-tabs.css";

function installPropertyLocationTabs() {
  const form = document.querySelector("#property-editor-form");
  if (!form || form.dataset.locationTabsReady === "1") return false;

  const exactAddress = form.querySelector('input[name="address"]')?.closest("label");
  const exactCoordinates = form.querySelector('input[name="coordinates"]')?.closest("label");
  const customerFieldset = form.querySelector(".customer-location-fields");
  const customerAddress = form.querySelector('input[name="publicAddress"]')?.closest("label");
  const customerCoordinates = form.querySelector('input[name="publicCoordinates"]')?.closest("label");
  if (!exactAddress || !exactCoordinates || !customerFieldset || !customerAddress || !customerCoordinates) return false;

  form.dataset.locationTabsReady = "1";
  form.querySelector('input[name="address"]').required = true;
  form.querySelector('input[name="coordinates"]').required = true;
  form.querySelector('input[name="publicAddress"]').required = true;
  form.querySelector('input[name="publicCoordinates"]').required = true;

  exactAddress.childNodes[0].textContent = "Exact location / landmark";
  exactCoordinates.childNodes[0].textContent = "Exact map coordinates";
  customerAddress.childNodes[0].textContent = "Customer location / landmark";
  customerCoordinates.childNodes[0].textContent = "Customer map coordinates";

  form.querySelector('input[name="publicAddress"]').placeholder = "Location you want customers to see";
  form.querySelector('input[name="publicCoordinates"]').placeholder = "Latitude, Longitude for customer map";

  const shell = document.createElement("section");
  shell.className = "property-location-tabs";
  shell.innerHTML = `
    <div class="property-location-heading">
      <div><small>LOCATION VISIBILITY</small><b>Choose which location you are entering</b></div>
      <span>Both are required</span>
    </div>
    <div class="property-location-tabbar" role="tablist" aria-label="Property location type">
      <button type="button" class="active" data-location-tab="exact" role="tab" aria-selected="true">🔒 Exact Location</button>
      <button type="button" data-location-tab="customer" role="tab" aria-selected="false">👤 Customer Location</button>
    </div>
    <div class="property-location-panel active" data-location-panel="exact">
      <p><b>Internal location.</b> Used inside the Admin/Director view. This is not sent in customer property sharing.</p>
      <div class="property-location-grid exact-location-grid"></div>
    </div>
    <div class="property-location-panel" data-location-panel="customer" hidden>
      <p><b>Shareable location.</b> Enter the location and map point you want the customer to receive. The system will not generate or shift this location.</p>
      <div class="property-location-grid customer-location-grid"></div>
      <div class="customer-share-rule">✓ Customer Panel → Share Property always uses this Customer Location.</div>
    </div>`;

  shell.querySelector(".exact-location-grid").append(exactAddress, exactCoordinates);
  shell.querySelector(".customer-location-grid").append(customerAddress, customerCoordinates);
  customerFieldset.replaceWith(shell);

  const selectTab = (name) => {
    shell.querySelectorAll("[data-location-tab]").forEach((button) => {
      const active = button.dataset.locationTab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    shell.querySelectorAll("[data-location-panel]").forEach((panel) => {
      const active = panel.dataset.locationPanel === name;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  };

  shell.querySelectorAll("[data-location-tab]").forEach((button) => {
    button.addEventListener("click", () => selectTab(button.dataset.locationTab));
  });

  form.addEventListener("submit", (event) => {
    const missingExact = !form.elements.address.value.trim() || !form.elements.coordinates.value.trim();
    const missingCustomer = !form.elements.publicAddress.value.trim() || !form.elements.publicCoordinates.value.trim();
    if (!missingExact && !missingCustomer) return;
    event.preventDefault();
    selectTab(missingExact ? "exact" : "customer");
    const target = missingExact
      ? (!form.elements.address.value.trim() ? form.elements.address : form.elements.coordinates)
      : (!form.elements.publicAddress.value.trim() ? form.elements.publicAddress : form.elements.publicCoordinates);
    target.focus();
    target.reportValidity();
  }, true);

  return true;
}

if (!installPropertyLocationTabs()) {
  const observer = new MutationObserver(() => {
    if (installPropertyLocationTabs()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 10000);
}

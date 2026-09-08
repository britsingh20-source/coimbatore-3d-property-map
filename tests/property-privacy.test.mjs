import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/main-property-catalog.js";

const property = {
  id: "privacy-test-01", title: "3 BHK Villa", property_kind: "Villa", bedrooms: "3 BHK",
  address: "Near Private Landmark, Edappadi", public_address: "Edappadi area, Coimbatore",
  price: "₹59 L", land_area: "2.75 cents", built_up_area: "1175 sq.ft.", facing: "East",
  approval: "DTCP", road: "30 ft road", longitude: 76.98, latitude: 11.02,
  public_longitude: 76.989, public_latitude: 11.02, instagram_url: "https://www.instagram.com/reel/example/",
  features_json: "[]"
};

function db(session = null) {
  return { prepare(sql) { return {
    bind() { return this; },
    async first() { return sql.includes("telecaller_sessions") ? session : null; },
    async all() {
      if (sql.includes("FROM properties")) return { results: [property] };
      if (sql.includes("FROM property_images")) return { results: [] };
      return { results: [] };
    },
    async run() { return { success: true }; }
  }; } };
}

test("public property response excludes exact location and owner contacts", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/properties"), { DB: db() });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.properties[0].address, "Edappadi area, Coimbatore");
  assert.deepEqual(body.properties[0].coordinates, [76.989, 11.02]);
  assert.equal(body.properties[0].exactLocation, false);
  assert.equal(body.properties[0].locationAccuracy, "approximate_1km");
  assert.equal("publicAddress" in body.properties[0], false);
  assert.equal(JSON.stringify(body).includes("Private Landmark"), false);
});

test("authenticated staff receive exact location but not contact records", async () => {
  const request = new Request("https://example.test/api/properties", { headers: { authorization: "Bearer valid" } });
  const response = await worker.fetch(request, { DB: db({ user_label: "Administrator", active: 1 }) });
  const body = await response.json();
  assert.equal(body.properties[0].address, "Near Private Landmark, Edappadi");
  assert.deepEqual(body.properties[0].coordinates, [76.98, 11.02]);
  assert.equal(body.properties[0].exactLocation, true);
  assert.equal(JSON.stringify(body).includes("contact_phone"), false);
});

test("owner contacts endpoint rejects non-Director sessions", async () => {
  const request = new Request("https://example.test/api/properties/privacy-test-01/contacts", { headers: { authorization: "Bearer valid" } });
  const response = await worker.fetch(request, { DB: db({ user_label: "Administrator", active: 1 }) });
  assert.equal(response.status, 403);
});

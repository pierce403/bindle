import { expect, test } from "@playwright/test";
import { applyEndpointPreset, defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { saveConnectionPolicy } from "../src/privacy/connectionPolicyState";

test("explicit empty DNS and direct-peer lists survive policy persistence", () => {
  const result = saveConnectionPolicy({
    ...defaultConnectionPolicy,
    railgunBroadcasterDnsDiscoveryEnabled: false,
    railgunBroadcasterDnsDiscoveryUrls: [],
    railgunBroadcasterDnsResolverUrls: [],
    railgunBroadcasterDirectPeers: []
  });
  expect(result.railgunBroadcasterDnsDiscoveryEnabled).toBe(false);
  expect(result.railgunBroadcasterDnsDiscoveryUrls).toEqual([]);
  expect(result.railgunBroadcasterDnsResolverUrls).toEqual([]);
  expect(result.railgunBroadcasterDirectPeers).toEqual([]);
});

test("privacy max clears discovery and POI configuration", () => {
  const result = saveConnectionPolicy(applyEndpointPreset(defaultConnectionPolicy, "privacy-max"));
  expect(result.wakuEnabled).toBe(false);
  expect(result.railgunBroadcasterDnsDiscoveryEnabled).toBe(false);
  expect(result.railgunBroadcasterDnsResolverUrls).toEqual([]);
  expect(result.railgunPoiListKeys).toEqual([]);
});

test("old simulated broadcaster settings cannot persist as an enabled route", () => {
  const result = saveConnectionPolicy({
    ...defaultConnectionPolicy, endpointPreset: "custom",
    broadcasterUrl: "mock://simulated-broadcaster"
  });
  expect(result.broadcasterUrl).toBe("");
});

import { expect, test } from "bun:test";
import {
  boundaryAnchor,
  preferences,
  type Criterion,
  type Place,
  type Profile,
} from "./domain";
const place: Place = {
  id: "place",
  name: "Town",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.2, 53.3],
        [-6.1, 53.3],
        [-6.1, 53.4],
        [-6.2, 53.3],
      ],
    ],
  },
  attributes: { geography: { code: "T1", codeSystem: "CSO" } },
};
const profile: Profile = {
  bedrooms: 3,
  tenure: "rent",
  budget: "1800",
  ages: "3, 8",
  mode: "public_transport",
  car: false,
  radiusKm: 10,
};
const definitions: Criterion[] = [
  {
    id: "health.hospital",
    vertical: "health",
    category: "hospital",
    method: "travel_time",
    label: "health / hospital",
    defaults: { maximumMinutes: 30 },
  },
  {
    id: "education.childcare",
    vertical: "education",
    category: "childcare",
    method: "distance",
    label: "education / childcare",
    defaults: {},
  },
  {
    id: "budget.rent",
    vertical: "budget",
    category: "rent",
    method: "market_context",
    label: "budget / rent",
    defaults: {},
  },
];
test("frontend emits actual API criteria contract without false bedroom or market joins", () => {
  const p = preferences(
    { longitude: -6.2, latitude: 53.3 },
    place,
    profile,
    {
      "health.hospital": {
        importance: "required",
        requiredService: "cardiology",
      },
      "education.childcare": { importance: "preferred" },
      "budget.rent": { importance: "preferred" },
    },
    definitions,
  );
  expect(p.criteria).toHaveLength(3);
  expect(p.criteria[0].parameters).toEqual({
    maximumMinutes: 30,
    mode: "public_transport",
    requiredService: "cardiology",
  });
  expect(p.criteria[1].parameters).toEqual({
    maximumDistanceM: 2000,
    childAge: 3,
  });
  expect(p.criteria[2].parameters).toEqual({ maximumAmountEur: 1800 });
  expect(JSON.stringify(p)).not.toContain("bedrooms");
  expect(JSON.stringify(p)).not.toContain("marketGeography");
});
test("single, seven and all registry choices have no frontend count cap", () => {
  for (const count of [1, 7, 24]) {
    const registry = Array.from({ length: count }, (_, i) => ({
      ...definitions[0],
      id: `criterion${i}`,
    }));
    const choices = Object.fromEntries(
      registry.map((c) => [c.id, { importance: "preferred" as const }]),
    );
    expect(
      preferences(boundaryAnchor(place), place, profile, choices, registry)
        .criteria,
    ).toHaveLength(count);
  }
});

import {
  calculateCosts,
  combinedFeatures,
  emptyCosts,
  monthlyMortgage,
  type Layer,
} from "./domain";
test("unknown costs remain incomplete and do not yield apparent budget headroom", () => {
  const estimate = calculateCosts(
    "rent",
    { ...emptyCosts, rent: "1750", monthlyBudget: "2500" },
    {},
    ["education.childcare"],
  );
  expect(estimate.subtotal).toBe(1750);
  expect(estimate.complete).toBe(false);
  expect(estimate.missing).toBe(4);
  expect(estimate.headroom).toBeNull();
});
test("rent, recurring services, transport and bills produce complete monthly totals and headroom", () => {
  const inputs = {
    ...emptyCosts,
    rent: "1750",
    transport: "280",
    utilities: "180",
    other: "130",
    monthlyBudget: "2500",
  };
  const estimate = calculateCosts(
    "rent",
    inputs,
    {
      "education.childcare": "100",
      "quality_of_life.clubs": "0",
      "removed.service": "999",
    },
    ["education.childcare", "quality_of_life.clubs"],
  );
  expect(estimate.subtotal).toBe(2440);
  expect(estimate.serviceTotal).toBe(100);
  expect(estimate.complete).toBe(true);
  expect(estimate.headroom).toBe(60);
  expect(
    calculateCosts("rent", { ...inputs, monthlyBudget: "2000" }, {}, [])
      .headroom,
  ).toBe(-340);
});
test("mortgage amortisation includes zero-interest loans and rejects invalid assumptions", () => {
  expect(monthlyMortgage("350000", "35000", "4", "30")).toBeCloseTo(1503.86, 1);
  expect(monthlyMortgage("120000", "0", "0", "10")).toBe(1000);
  for (const args of [
    ["", "", "", ""],
    ["100", "101", "4", "30"],
    ["100", "0", "4", "0"],
    ["100", "0", "4", "51"],
    ["100", "0", "-1", "30"],
    ["100", "0", "NaN", "30"],
  ])
    expect(
      monthlyMortgage(...(args as [string, string, string, string])),
    ).toBeNull();
  const buy = calculateCosts(
    "buy",
    {
      ...emptyCosts,
      price: "120000",
      deposit: "0",
      rate: "0",
      years: "10",
      rent: "9999",
      transport: "0",
      utilities: "0",
      other: "0",
      monthlyBudget: "1500",
    },
    {},
    [],
  );
  expect(buy.subtotal).toBe(1000);
  expect(buy.headroom).toBe(500);
});
test("invalid costs are unknown and explicit zero costs count as entered", () => {
  const estimate = calculateCosts(
    "rent",
    {
      ...emptyCosts,
      rent: "-1",
      transport: "Infinity",
      utilities: "0",
      other: "",
      monthlyBudget: "3000",
    },
    { service: "0" },
    ["service"],
  );
  expect(estimate.missing).toBe(3);
  expect(estimate.entered).toBe(2);
  expect(estimate.headroom).toBeNull();
});
test("combined map preserves points, lines and polygons, deduplicates shared records and retains memberships", () => {
  const f = (id: string, type: string) => ({
    id,
    type: "Feature" as const,
    geometry: { type, coordinates: [] },
    properties: { name: id, category: "parks" },
  });
  const layer = (id: string, features: any[]): Layer => ({
    id,
    vertical: "quality_of_life",
    category: "parks",
    data: { features },
    nextCursor: null,
    snapshotIds: [],
    sources: [],
    evidenceStatus: "partial",
    explanation: "",
  });
  const a = layer("parks", [f("shared", "Polygon"), f("point", "Point")]),
    b = layer("green_areas", [
      f("shared", "Polygon"),
      f("line", "LineString"),
      { ...f("unlocated", "Point"), geometry: null },
    ]);
  const combined = combinedFeatures([a, b]);
  expect(combined).toHaveLength(3);
  expect(combined.find((f) => f.id === "shared")?.criteria).toEqual([
    "parks",
    "green_areas",
  ]);
  expect(combined.map((f) => f.geometry?.type)).toEqual([
    "Polygon",
    "Point",
    "LineString",
  ]);
  expect(
    combinedFeatures([b]).find((f) => f.id === "shared")?.criteria,
  ).toEqual(["green_areas"]);
  expect(combinedFeatures([a, a])).toHaveLength(2);
  expect(combinedFeatures([])).toEqual([]);
});

test("submitted distance and broadband defaults match the visible controls", () => {
  const broadband: Criterion = {
    id: "utilities.broadband",
    vertical: "utilities",
    category: "broadband",
    method: "property_evidence",
    label: "utilities / broadband",
    defaults: {},
  };
  const choices = {
    "education.childcare": { importance: "preferred" as const },
    "utilities.broadband": { importance: "preferred" as const },
  };
  const result = preferences(boundaryAnchor(place), place, profile, choices, [
    ...definitions,
    broadband,
  ]);
  expect(result.criteria[0].parameters.maximumDistanceM).toBe(2000);
  expect(result.criteria[1].parameters.minimumDownloadMbps).toBe(100);
  const explicit = preferences(
    boundaryAnchor(place),
    place,
    profile,
    {
      "education.childcare": { importance: "required", maximumDistanceM: 500 },
      "utilities.broadband": {
        importance: "preferred",
        minimumDownloadMbps: 1000,
      },
    },
    [...definitions, broadband],
  );
  expect(explicit.criteria[0].parameters.maximumDistanceM).toBe(500);
  expect(explicit.criteria[1].parameters.minimumDownloadMbps).toBe(1000);
});

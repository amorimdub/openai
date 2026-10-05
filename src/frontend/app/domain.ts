export type Criterion = {
  id: string;
  vertical: string;
  category: string;
  method: string;
  label: string;
  defaults: Record<string, unknown>;
};
export type Geometry = { type: string; coordinates: any };
export type Place = {
  id: string;
  name: string;
  geometry: Geometry;
  attributes: {
    county?: string;
    geography: { code: string; codeSystem: string };
  };
};
export type Choice = {
  importance: "preferred" | "required";
  maximumMinutes?: number;
  maximumDistanceM?: number;
  mode?: string;
  minimumDownloadMbps?: number;
  requiredService?: string;
};
export type Profile = {
  people?: { age: number | null }[];
  bedrooms: number;
  tenure: "buy" | "rent";
  budget: string;
  ages: string;
  mode: "driving" | "walking" | "cycling" | "public_transport" | "mixed";
  car: boolean;
  radiusKm: number;
};
export function boundaryAnchor(place: Place): {
  longitude: number;
  latitude: number;
} {
  let coordinates = place.geometry.coordinates;
  while (Array.isArray(coordinates[0])) coordinates = coordinates[0];
  return { longitude: coordinates[0], latitude: coordinates[1] };
}
export const label = (criterion: Criterion) =>
  criterion.label.split(" / ").at(-1)!;
export const pillarLabels: Record<string, string> = {
  health: "Health",
  transportation: "Transportation",
  quality_of_life: "Quality of life",
  education: "Education",
  utilities: "Utilities",
  budget: "Housing budget",
  housing: "Housing information",
};
export const pillarColors: Record<string, string> = {
  health: "#dc6376",
  transportation: "#4684c4",
  quality_of_life: "#469768",
  education: "#8263bc",
  utilities: "#bd882f",
  budget: "#bd882f",
  housing: "#657d8e",
};
export type Source = {
  snapshotId: string;
  publisher: string;
  observedPeriod: string | null;
  license: string;
  limitations: string[];
  sourceUrl: string;
};
export type Feature = {
  id: string;
  type: "Feature";
  geometry: Geometry | null;
  properties: {
    name: string;
    category: string;
    observedPeriod?: string | null;
    recordedGeometryDistanceM?: number;
    [key: string]: any;
  };
};
export type Layer = {
  id: string;
  vertical: string;
  category: string;
  data: { features: Feature[] };
  displayCategories?: string[];
  nextCursor: string | null;
  snapshotIds: string[];
  sources: Source[];
  evidenceStatus: string;
  explanation: string;
};
export type MapFeature = Feature & { criteria: string[]; vertical: string };
export function combinedFeatures(layers: Layer[]): MapFeature[] {
  const unique = new Map<string, MapFeature>();
  for (const layer of layers)
    for (const feature of layer.data.features) {
      if (!feature.geometry) continue;
      const previous = unique.get(feature.id);
      if (previous) {
        if (!previous.criteria.includes(layer.id))
          previous.criteria.push(layer.id);
      } else
        unique.set(feature.id, {
          ...feature,
          criteria: [layer.id],
          vertical: layer.vertical,
        });
    }
  return [...unique.values()];
}
export type CostInputs = {
  rent: string;
  price: string;
  deposit: string;
  rate: string;
  years: string;
  utilities: string;
  transport: string;
  other: string;
  monthlyBudget: string;
};
export const emptyCosts: CostInputs = {
  rent: "",
  price: "",
  deposit: "",
  rate: "",
  years: "",
  utilities: "",
  transport: "",
  other: "",
  monthlyBudget: "",
};
export function nonnegative(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function monthlyMortgage(
  price: string,
  deposit: string,
  rate: string,
  years: string,
): number | null {
  const p = nonnegative(price),
    d = nonnegative(deposit),
    r = nonnegative(rate),
    y = nonnegative(years);
  if (
    p === null ||
    d === null ||
    r === null ||
    y === null ||
    p <= 0 ||
    d > p ||
    y <= 0 ||
    y > 50 ||
    r > 100
  )
    return null;
  const principal = p - d,
    months = y * 12,
    monthlyRate = r / 1200;
  return monthlyRate === 0
    ? principal / months
    : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}
export function calculateCosts(
  tenure: Profile["tenure"],
  inputs: CostInputs,
  serviceCosts: Record<string, string>,
  criterionIds: string[],
) {
  const housing =
    tenure === "rent"
      ? nonnegative(inputs.rent)
      : monthlyMortgage(
          inputs.price,
          inputs.deposit,
          inputs.rate,
          inputs.years,
        );
  const parts = [
    {
      id: "housing",
      label: tenure === "rent" ? "Rent" : "Mortgage repayment",
      amount: housing,
    },
    {
      id: "transport",
      label: "Transport",
      amount: nonnegative(inputs.transport),
    },
    {
      id: "utilities",
      label: "Utilities",
      amount: nonnegative(inputs.utilities),
    },
    {
      id: "other",
      label: "Other household costs",
      amount: nonnegative(inputs.other),
    },
  ];
  const services = criterionIds.map((id) => ({
    id,
    amount: nonnegative(serviceCosts[id] ?? ""),
  }));
  const serviceTotal = services.reduce((n, s) => n + (s.amount ?? 0), 0);
  const subtotal =
    parts.reduce((n, p) => n + (p.amount ?? 0), 0) + serviceTotal;
  const missing =
    parts.filter((p) => p.amount === null).length +
    services.filter((s) => s.amount === null).length;
  const entered =
    parts.filter((p) => p.amount !== null).length +
    services.filter((s) => s.amount !== null).length;
  const budget = nonnegative(inputs.monthlyBudget);
  return {
    parts,
    services,
    serviceTotal,
    subtotal,
    missing,
    entered,
    complete: missing === 0,
    headroom: missing === 0 && budget !== null ? budget - subtotal : null,
    budget,
  };
}
export function preferences(
  origin: { longitude: number; latitude: number },
  place: Place,
  profile: Profile,
  choices: Record<string, Choice>,
  registry: Criterion[],
) {
  return {
    version: 1,
    location: { ...origin, placeId: place.id },
    radiusKm: profile.radiusKm,
    criteria: Object.entries(choices).map(([id, choice]) => {
      const definition = registry.find((c) => c.id === id)!;
      const parameters: Record<string, unknown> = {};
      if (definition.method === "travel_time") {
        parameters.maximumMinutes =
          choice.maximumMinutes ??
          Number(definition.defaults.maximumMinutes ?? 30);
        const mode = choice.mode ?? profile.mode;
        if (mode !== "mixed") parameters.mode = mode;
      }
      if (definition.method === "distance")
        parameters.maximumDistanceM = choice.maximumDistanceM ?? 2000;
      if (definition.category === "broadband")
        parameters.minimumDownloadMbps = choice.minimumDownloadMbps ?? 100;
      if (id === "education.childcare") {
        const age = profile.people
          ? profile.people.find(
              (person) => person.age !== null && person.age <= 18,
            )?.age
          : profile.ages.trim()
            ? Number(profile.ages.split(",")[0].trim())
            : undefined;
        if (
          age !== undefined &&
          age !== null &&
          Number.isFinite(age) &&
          age >= 0 &&
          age <= 18
        )
          parameters.childAge = age;
      }
      if (
        choice.requiredService?.trim() &&
        ["travel_time", "distance"].includes(definition.method)
      )
        parameters.requiredService = choice.requiredService.trim();
      if (definition.method === "market_context") {
        if (Number(profile.budget) > 0)
          parameters.maximumAmountEur = Number(profile.budget);
      }
      // Bedroom preferences belong to a household; selecting an area observation with
      // unknown bedrooms would fabricate a match, so never append bedrooms here.
      return { id, importance: choice.importance, parameters };
    }),
  };
}
export async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30000);
  try {
    const response = await fetch(`/api${path}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        err.message ??
          `Data service returned ${response.status}. Please retry.`,
      );
    }
    return await response.json();
  } catch (error) {
    if (timeout.aborted && !signal?.aborted)
      throw new Error("The data service took too long. Please retry.");
    throw error;
  }
}

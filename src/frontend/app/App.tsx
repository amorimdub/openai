import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  boundaryAnchor,
  label,
  pillarLabels,
  preferences,
  type Choice,
  type Criterion,
  type Place,
  type Profile,
  type Layer,
  emptyCosts,
  type CostInputs,
} from "./domain";
import { Dashboard } from "./Dashboard";
import { Onboarding } from "./Onboarding";
import {
  freshDraft,
  readProfile,
  saveProfile,
  transportModes,
  type Draft,
  type SavedProfile,
} from "./onboarding-model";
const money = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const symbols: Record<string, string> = {
  health: "✚",
  transportation: "↗",
  quality_of_life: "❋",
  education: "◇",
  utilities: "ϟ",
  budget: "€",
  housing: "⌂",
};
const initialProfile: Profile = {
  bedrooms: 2,
  tenure: "rent",
  budget: "",
  ages: "",
  mode: "driving",
  car: true,
  radiusKm: 10,
};
const prettify = (s: string) => s.replace(/_/g, " ");
export function App() {
  const [saved, setSaved] = useState<SavedProfile | null>(() => {
    try {
      return readProfile(localStorage);
    } catch {
      return null;
    }
  });
  const [draft, setDraft] = useState<Draft>(() => saved?.draft ?? freshDraft());
  const [setupKey, setSetupKey] = useState(0);
  const [scope, setScope] = useState(saved?.draft.scope ?? null);
  const [regions, setRegions] = useState<Place[]>([]);
  const [step, setStep] = useState(saved ? 3 : 0),
    [registry, setRegistry] = useState<Criterion[]>([]),
    [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [place, setPlace] = useState<Place | null>(
      saved?.draft.scope === "specific" ? saved.draft.place : null,
    ),
    [origin, setOrigin] = useState<{
      longitude: number;
      latitude: number;
    } | null>(null),
    [anchorLabel, setAnchorLabel] = useState("Town boundary anchor"),
    [profile, setProfile] = useState(saved?.profile ?? initialProfile),
    [choices, setChoices] = useState<Record<string, Choice>>({}),
    [layers, setLayers] = useState<Layer[]>([]),
    [assessment, setAssessment] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [cart, setCart] = useState(false),
    [locationPicker, setLocationPicker] = useState(false),
    [applied, setApplied] = useState<{
      profile: Profile;
      choices: Record<string, Choice>;
      anchorLabel: string;
      origin: { longitude: number; latitude: number };
    } | null>(null);
  const [costs, setCosts] = useState<CostInputs>(emptyCosts),
    [serviceCosts, setServiceCosts] = useState<Record<string, string>>({}),
    [costSource, setCostSource] = useState("");
  const [searchingPlaces, setSearchingPlaces] = useState(false),
    [placeSearchError, setPlaceSearchError] = useState(""),
    [placeSearchRetry, setPlaceSearchRetry] = useState(0);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const resetCosts = () => {
    setCosts({ ...emptyCosts });
    setServiceCosts({});
    setCostSource("");
  };
  const requestVersion = useRef(0),
    placeVersion = useRef(0),
    paging = useRef(new Set<string>());
  useEffect(() => {
    const abort = new AbortController();
    api("/criteria", undefined, abort.signal)
      .then((criteria) => setRegistry(criteria.criteria))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    setPlaces([]);
    setPlaceSearchError("");
    if (!locationPicker || !query.trim()) {
      setSearchingPlaces(false);
      return;
    }
    const abort = new AbortController();
    setSearchingPlaces(true);
    const timer = setTimeout(
      () =>
        api(
          `/places?q=${encodeURIComponent(query.trim())}&limit=8`,
          undefined,
          abort.signal,
        )
          .then((r) => {
            if (abort.signal.aborted) return;
            setPlaces(r.places);
            setSearchingPlaces(false);
          })
          .catch((e) => {
            if (abort.signal.aborted || e.name === "AbortError") return;
            setPlaceSearchError("Town search is unavailable. Please try again.");
            setSearchingPlaces(false);
          }),
      200,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, locationPicker, placeSearchRetry]);
  const choosePlace = async (p: Place) => {
    setLocationPicker(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (p.id !== place?.id) resetCosts();
    const version = ++placeVersion.current;
    requestVersion.current++;
    setLoading(false);
    setPlace(p);
    setQuery(p.name);
    setPlaces([]);
    setError("");
    setLayers([]);
    setAssessment(null);
    setApplied(null);
    let anchor = boundaryAnchor(p);
    let caption = "Town boundary anchor";
    setOrigin(null);
    try {
      const result = await api(
        `/place-anchor?placeId=${encodeURIComponent(p.id)}`,
      );
      anchor = result.location ??
        result.anchor ?? {
          longitude: result.longitude,
          latitude: result.latitude,
        };
      caption = "Representative town anchor";
    } catch {
      /* Clearly labelled source-boundary fallback. */
    }
    if (version !== placeVersion.current) return;
    setOrigin(anchor);
    setAnchorLabel(caption);
    if (step === 4 || step === 5) await load(p, anchor, caption);
  };
  const updateProfile = (patch: Partial<Profile>) => {
    if (patch.tenure && patch.tenure !== profile.tenure) resetCosts();
    setProfile((p) => ({ ...p, ...patch }));
  };
  const toggle = (id: string) =>
    setChoices((previous) => {
      const next = { ...previous };
      if (next[id]) delete next[id];
      else next[id] = { importance: "preferred" };
      return next;
    });
  const changeChoice = (id: string, patch: Partial<Choice>) =>
    setChoices((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const load = async (p = place, o = origin, caption = anchorLabel) => {
    if (!p) return;
    const version = ++requestVersion.current;
    const appliedChoices = { ...choices },
      appliedProfile = { ...profile };
    setLoading(true);
    setError("");
    try {
      if (!o) {
        o = boundaryAnchor(p);
        caption = "Town boundary anchor";
        try {
          const anchor = await api(
            `/place-anchor?placeId=${encodeURIComponent(p.id)}`,
          );
          o = anchor.location ??
            anchor.anchor ?? {
              longitude: anchor.longitude,
              latitude: anchor.latitude,
            };
          caption = "Representative town anchor";
        } catch {
          /* Labelled boundary fallback. */
        }
        if (version !== requestVersion.current) return;
        setOrigin(o);
        setAnchorLabel(caption);
      }
      if (!o) throw new Error("Choose a search point before loading evidence.");
      const prefs = preferences(o, p, profile, choices, registry);
      const [layerResult, assessResult] = await Promise.all([
        prefs.criteria.length
          ? api("/layers", { ...prefs, limit: 100 })
          : Promise.resolve({ layers: [] }),
        prefs.criteria.length ? api("/assess", prefs) : Promise.resolve(null),
      ]);
      if (version !== requestVersion.current) return;
      setLayers(layerResult.layers);
      setAssessment(assessResult);
      setApplied({
        profile: appliedProfile,
        choices: appliedChoices,
        origin: o,
        anchorLabel: caption,
      });
      setStep(4);
    } catch (e) {
      if (version === requestVersion.current) setError((e as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  const more = async (id: string) => {
    const layer = layers.find((l) => l.id === id);
    if (
      !layer?.nextCursor ||
      !layer.displayCategories ||
      !applied ||
      paging.current.has(id)
    )
      return;
    const version = requestVersion.current;
    paging.current.add(id);
    try {
      const params = new URLSearchParams({
        longitude: String(applied.origin.longitude),
        latitude: String(applied.origin.latitude),
        radiusM: String(applied.profile.radiusKm * 1000),
        categories: layer.displayCategories.join(","),
        limit: "100",
        cursor: layer.nextCursor,
      });
      const r = await api(`/features?${params}`);
      if (version !== requestVersion.current) return;
      setLayers((previous) =>
        previous.map((l) =>
          l.id === id
            ? {
                ...l,
                data: {
                  features: [
                    ...new Map(
                      [...l.data.features, ...r.data.features].map((f) => [
                        f.id,
                        f,
                      ]),
                    ).values(),
                  ],
                },
                nextCursor: r.nextCursor,
                snapshotIds: [...new Set([...l.snapshotIds, ...r.snapshotIds])],
                sources: [
                  ...new Map(
                    [...l.sources, ...r.sources].map((s) => [s.snapshotId, s]),
                  ).values(),
                ],
              }
            : l,
        ),
      );
    } finally {
      paging.current.delete(id);
    }
  };
  const dirty =
    !applied ||
    JSON.stringify(choices) !== JSON.stringify(applied.choices) ||
    JSON.stringify(profile) !== JSON.stringify(applied.profile) ||
    JSON.stringify(origin) !== JSON.stringify(applied.origin);
  const onDraftChange = useCallback((value: Draft) => setDraft(value), []);
  const finishOnboarding = (value: Draft) => {
    const bundle = saveProfile(value, localStorage);
    if (
      bundle.profile.tenure !== profile.tenure ||
      value.place?.id !== place?.id
    )
      resetCosts();
    requestVersion.current++;
    placeVersion.current++;
    setLoading(false);
    setSaved(bundle);
    setProfile(bundle.profile);
    setScope(value.scope);
    setPlace(value.scope === "specific" ? value.place : null);
    setOrigin(null);
    setLayers([]);
    setAssessment(null);
    setApplied(null);
    setStep(3);
    setCart(false);
    setError("");
  };
  const startSetup = (edit = false) => {
    requestVersion.current++;
    placeVersion.current++;
    setLoading(false);
    setDraft(edit && saved ? structuredClone(saved.draft) : freshDraft());
    setSetupKey((key) => key + 1);
    setStep(0);
    setCart(false);
    setLocationPicker(false);
    setError("");
    if (!edit) {
      resetCosts();
      setChoices({});
      setLayers([]);
      setAssessment(null);
      setApplied(null);
      setPlace(null);
      setOrigin(null);
      setScope(null);
      setProfile(initialProfile);
      setQuery("");
    }
  };
  const browseRegions = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      let cursor: string | null = null;
      const all: Place[] = [];
      do {
        const result = await api(
          `/features?bbox=-11,51,-5,56&categories=urban_area&limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (version !== requestVersion.current) return;
        all.push(
          ...result.data.features.map((feature: any) => ({
            ...feature.properties,
            geometry: feature.geometry,
          })),
        );
        cursor = result.nextCursor ?? null;
      } while (cursor);
      setRegions(all);
      setStep(5);
    } catch (e) {
      if (version === requestVersion.current) setError((e as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  const badge = Object.keys(choices).length;
  const searchContext =
    step === 0
      ? {
          scope: draft.scope,
          place: draft.place,
          bedrooms: draft.bedrooms,
          tenure: draft.tenure,
          budget: draft.budgets[draft.tenure],
        }
      : {
          scope,
          place,
          bedrooms: profile.bedrooms,
          tenure: profile.tenure,
          budget: profile.budget,
        };
  return (
    <div
      className={
        step === 0
          ? "live-app profile-setup"
          : step === 3
            ? "live-app service-selection"
            : "live-app dashboard-mode"
      }
    >
      <header className="map-header">
        <a className="brand" href="/">
          <span className="brand-pin">⌖</span>
          <span>
            Find your place<small>IRELAND</small>
          </span>
        </a>
        <div className="header-actions">
          <button aria-expanded={cart} onClick={() => setCart(!cart)}>
            Your profile{" "}
            <small className="pill">
              {(saved?.profile.people ?? draft.people).length}
            </small>
          </button>
          {(step === 4 || step === 5) && (
            <button
              onClick={() => {
                requestVersion.current++;
                setLoading(false);
                setStep(3);
              }}
            >
              Edit priorities
            </button>
          )}
          <button onClick={() => startSetup()}>Start again</button>
        </div>
      </header>
      {error && (
        <div className="service-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {locationPicker && (
        <LocationPicker onClose={() => setLocationPicker(false)}>
          <div className="location-picker-card">
            <div className="panel-heading">
              <h2>Choose a place to review</h2>
              <button
                aria-label="Close location picker"
                onClick={() => setLocationPicker(false)}
              >
                ×
              </button>
            </div>
            <label className="input-label">
              <span>Town or city</span>
              <input
                autoFocus
                placeholder="Search towns and cities"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="place-results">
              {places.map((p) => (
                <button
                  key={p.id}
                  className="choice"
                  onClick={() => void choosePlace(p)}
                >
                  <strong>{p.name}</strong>
                  <small>{p.attributes.county ?? "CSO urban area"}</small>
                </button>
              ))}
            </div>
            {searchingPlaces && (
              <p className="fine-note" role="status">
                Searching towns and cities…
              </p>
            )}
            {!searchingPlaces && !placeSearchError && (
              <p className="fine-note" role="status">
                {!query.trim()
                  ? "Enter a town or city name to see suggestions."
                  : !places.length
                    ? "No towns or cities found. Try another name."
                    : `${places.length} ${places.length === 1 ? "suggestion" : "suggestions"} found. Choose a town or city.`}
              </p>
            )}
            {placeSearchError && (
              <div>
                <p className="error" role="alert">
                  {placeSearchError}
                </p>
                <button
                  type="button"
                  onClick={() => setPlaceSearchRetry((n) => n + 1)}
                >
                  Retry town search
                </button>
              </div>
            )}
            <p className="fine-note">
              Your selected services stay with you. Cost assumptions reset for
              the new location.
            </p>
          </div>
        </LocationPicker>
      )}
      {step === 0 && (
        <Onboarding
          key={setupKey}
          initial={draft}
          onSave={finishOnboarding}
          onDraftChange={onDraftChange}
        />
      )}
      {step === 3 && (
        <main className="dashboard service-dashboard">
          <div className="service-intro">
            <h1>What matters to you?</h1>
            <p>
              Choose the services that matter to your household. Mark each as
              required or preferred.
            </p>
          </div>
          {!registry.length ? (
            <p className="fine-note" role="status">
              {error
                ? "Service priorities are unavailable while the data service is offline. Your profile is saved."
                : "Loading service priorities…"}
            </p>
          ) : (
            <Criteria
              fullScreen
              registry={registry}
              choices={choices}
              toggle={toggle}
              change={changeChoice}
            />
          )}
          <div className="service-continue">
            <span>
              <strong>
                {badge} {badge === 1 ? "service selected" : "services selected"}
              </strong>
              <small>
                {scope === "anywhere" ? "Anywhere in Ireland" : place?.name} ·
                Your household profile is saved
              </small>
            </span>
            <button
              className="primary"
              disabled={loading || !registry.length}
              onClick={() => (scope === "anywhere" ? browseRegions() : load())}
            >
              {loading
                ? "Reading source evidence…"
                : scope === "anywhere"
                  ? "Explore regions →"
                  : "Explore this area →"}
            </button>
          </div>
        </main>
      )}
      {step === 5 && (
        <main className="dashboard all-regions">
          <div className="results-title">
            <div>
              <h1>Regions to explore</h1>
              <p>Choose a region to see its recorded service evidence.</p>
            </div>
            <span className="context-badge">
              {regions.length} towns and cities
            </span>
          </div>
          <div className="region-grid">
            {regions.map((r) => (
              <button
                className="region-card"
                disabled={loading}
                key={r.id}
                onClick={() => choosePlace(r)}
              >
                <div className="region-card-top">
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.attributes.county ?? "CSO urban area"}</small>
                  </span>
                </div>
                <span className="region-link">View source evidence ↗</span>
              </button>
            ))}
          </div>
          <p className="fine-note">
            CSO urban areas cover towns and cities. Rural localities may not
            appear. Suitability remains unknown.
          </p>
        </main>
      )}

      {step === 4 && place && origin && (
        <>
          <aside className="filters visible">
            <nav className="dashboard-nav" aria-label="Dashboard sections">
              <a href="#overview">⌂ Overview</a>
              <a href="#area-map">⌖ Area map</a>
              <a href="#service-review">◇ Service review</a>
              <a href="#costs">€ Cost & practicality</a>
              <a href="#data-sources">▤ Data sources</a>
            </nav>
            <div className="filters-heading">
              <div>
                <h2>Service priorities</h2>
                <p>
                  {place.name} · {profile.radiusKm} km
                </p>
              </div>
            </div>
            <label className="input-label sidebar-radius">
              <span>Search radius · {profile.radiusKm} km</span>
              <input
                aria-label="Dashboard search radius"
                type="range"
                min="1"
                max="50"
                value={profile.radiusKm}
                onChange={(e) =>
                  updateProfile({ radiusKm: Number(e.target.value) })
                }
              />
            </label>
            <Criteria
              registry={registry}
              choices={choices}
              toggle={toggle}
              change={changeChoice}
            />
            <button
              className="primary apply"
              disabled={loading || !badge}
              onClick={() => load()}
            >
              {loading ? "Updating…" : "Update evidence"}
            </button>
            <p className="filter-footnote">
              Required criteria are saved as preferences. Eligibility and fit
              remain unknown.
            </p>
          </aside>
          <Dashboard
            costs={costs}
            setCosts={setCosts}
            serviceCosts={serviceCosts}
            setServiceCosts={setServiceCosts}
            costSource={costSource}
            setCostSource={setCostSource}
            place={place}
            origin={applied?.origin ?? origin}
            anchorLabel={applied?.anchorLabel ?? anchorLabel}
            profile={applied?.profile ?? profile}
            choices={applied?.choices ?? choices}
            registry={registry}
            layers={layers}
            assessment={assessment}
            loading={loading}
            dirty={dirty}
            onUpdate={() => void load()}
            onEdit={() => {
              requestVersion.current++;
              setLoading(false);
              setStep(3);
            }}
            onChangeLocation={() => {
              setQuery("");
              setPlaces([]);
              setLocationPicker(true);
            }}
            onMore={more}
            onPick={(point) => {
              setOrigin(point);
              setAnchorLabel("Point selected on map");
              void load(place, point, "Point selected on map");
            }}
          />
        </>
      )}
      {cart && (
        <aside className="profile-cart" aria-label="Household profile">
          <div className="cart-heading">
            <div>
              <h2>{saved ? "Your saved profile" : "Your household profile"}</h2>
              <p>
                {saved ? "Saved in this browser" : "Selections you’re building"}
              </p>
            </div>
            <button onClick={() => setCart(false)} aria-label="Close profile">
              ×
            </button>
          </div>
          <div className="cart-profile">
            <span className="cart-lock">
              {saved ? "✓ Saved defaults" : "Profile in progress"}
            </span>
            <strong>
              {(saved?.profile.people ?? draft.people).length}{" "}
              {(saved?.profile.people ?? draft.people).length === 1
                ? "person"
                : "people"}{" "}
              in your household
            </strong>
            <small>
              Ages:{" "}
              {(saved?.profile.people ?? draft.people)
                .map((p) => (p.age === null ? "not specified" : p.age))
                .join(", ")}
            </small>
            <dl>
              <div>
                <dt>Main transport</dt>
                <dd>
                  {transportModes.find(
                    ([mode]) => mode === (saved?.profile.mode ?? draft.mode),
                  )?.[1] ?? "Not chosen"}
                </dd>
              </div>
              <div>
                <dt>Car available</dt>
                <dd>
                  {(saved?.profile.car ?? draft.car) === null
                    ? "Not chosen"
                    : (saved?.profile.car ?? draft.car)
                      ? "Yes"
                      : "No"}
                </dd>
              </div>
            </dl>
          </div>
          {saved && (
            <button className="edit-profile" onClick={() => startSetup(true)}>
              Edit saved profile
            </button>
          )}
          <div className="cart-criteria">
            <h3>
              Current selections <span>{badge}</span>
            </h3>
            <div className="cart-search-context">
              <span>
                {searchContext.scope === "anywhere"
                  ? "Anywhere in Ireland"
                  : (searchContext.place?.name ?? "Location not chosen")}
              </span>
              <small>
                {searchContext.bedrooms
                  ? `${searchContext.bedrooms}+ bedrooms · `
                  : ""}
                {searchContext.tenure === "rent" ? "Renting" : "Buying"}
                {searchContext.budget
                  ? ` · ${money(Number(searchContext.budget))}${searchContext.tenure === "rent" ? " / month" : ""}`
                  : ""}
              </small>
            </div>
            {Object.entries(choices).map(([id, c]) => (
              <div className="cart-item" key={id}>
                <span>
                  {label(registry.find((d) => d.id === id)!)}
                  <small>{c.importance}</small>
                </span>
                <button onClick={() => toggle(id)} aria-label={`Remove ${id}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
function Criteria({
  registry,
  choices,
  toggle,
  change,
  fullScreen = false,
}: {
  fullScreen?: boolean;
  registry: Criterion[];
  choices: Record<string, Choice>;
  toggle: (id: string) => void;
  change: (id: string, patch: Partial<Choice>) => void;
}) {
  return (
    <div
      className={
        fullScreen ? "criteria-editor service-grid" : "criteria-editor"
      }
    >
      {[...new Set(registry.map((c) => c.vertical))].map((vertical) => (
        <details
          key={vertical}
          className={
            fullScreen ? "filter-section service-pillar" : "filter-section"
          }
          open
        >
          <summary>
            <i>{symbols[vertical] ?? "⌂"}</i>
            {pillarLabels[vertical] ?? prettify(vertical)}
            <span>⌄</span>
          </summary>
          <div>
            {registry
              .filter((c) => c.vertical === vertical)
              .map((c) => (
                <div className="criterion-filter" key={c.id}>
                  <label className="radio-filter">
                    <input
                      type="checkbox"
                      checked={Boolean(choices[c.id])}
                      onChange={() => toggle(c.id)}
                    />
                    {label(c)}
                  </label>
                  {choices[c.id] && (
                    <>
                      <select
                        aria-label={`${label(c)} importance`}
                        value={choices[c.id].importance}
                        onChange={(e) =>
                          change(c.id, {
                            importance: e.target.value as Choice["importance"],
                          })
                        }
                      >
                        <option value="preferred">Preferred</option>
                        <option value="required">Required</option>
                      </select>
                      {c.method === "travel_time" && (
                        <label className="small-input">
                          <span>Maximum journey</span>
                          <select
                            value={
                              choices[c.id].maximumMinutes ??
                              Number(c.defaults.maximumMinutes ?? 30)
                            }
                            onChange={(e) =>
                              change(c.id, {
                                maximumMinutes: Number(e.target.value),
                              })
                            }
                          >
                            {[15, 30, 60, 90].map((m) => (
                              <option key={m} value={m}>
                                {m} min
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {c.id === "health.hospital" && (
                        <label className="small-input">
                          <span>Clinical service</span>
                          <input
                            placeholder="Optional, e.g. cardiology"
                            value={choices[c.id].requiredService ?? ""}
                            onChange={(e) =>
                              change(c.id, { requiredService: e.target.value })
                            }
                          />
                        </label>
                      )}
                      {c.id === "utilities.broadband" && (
                        <label className="small-input">
                          <span>Minimum speed</span>
                          <select
                            value={choices[c.id].minimumDownloadMbps ?? 100}
                            onChange={(e) =>
                              change(c.id, {
                                minimumDownloadMbps: Number(e.target.value),
                              })
                            }
                          >
                            {[100, 500, 1000].map((n) => (
                              <option key={n} value={n}>
                                {n} Mbps
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {c.method === "distance" && (
                        <label className="small-input">
                          <span>Desired distance</span>
                          <select
                            value={choices[c.id].maximumDistanceM ?? 2000}
                            onChange={(e) =>
                              change(c.id, {
                                maximumDistanceM: Number(e.target.value),
                              })
                            }
                          >
                            {[500, 1000, 2000, 5000].map((m) => (
                              <option key={m} value={m}>
                                {m / 1000} km
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function LocationPicker({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="location-picker"
      aria-label="Choose a location"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

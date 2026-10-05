import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [step, setStep] = useState(0),
    [registry, setRegistry] = useState<Criterion[]>([]),
    [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [place, setPlace] = useState<Place | null>(null),
    [origin, setOrigin] = useState<{
      longitude: number;
      latitude: number;
    } | null>(null),
    [anchorLabel, setAnchorLabel] = useState("Town boundary anchor"),
    [profile, setProfile] = useState(initialProfile),
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
    if (!query.trim() || query === place?.name) {
      setPlaces([]);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(
      () =>
        api(
          `/places?q=${encodeURIComponent(query)}&limit=8`,
          undefined,
          abort.signal,
        )
          .then((r) => setPlaces(r.places))
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          }),
      200,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, place?.id]);
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
    if (step === 4) await load(p, anchor, caption);
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
    if (!p || !o || !Object.keys(choices).length) return;
    const version = ++requestVersion.current;
    const appliedChoices = { ...choices },
      appliedProfile = { ...profile };
    setLoading(true);
    setError("");
    try {
      const prefs = preferences(o, p, profile, choices, registry);
      const [layerResult, assessResult] = await Promise.all([
        api("/layers", { ...prefs, limit: 100 }),
        api("/assess", prefs),
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
  const reset = () => {
    resetCosts();
    requestVersion.current++;
    placeVersion.current++;
    setLoading(false);
    setStep(0);
    setPlace(null);
    setOrigin(null);
    setChoices({});
    setLayers([]);
    setAssessment(null);
    setApplied(null);
    setProfile(initialProfile);
    setQuery("");
    setCart(false);
    setLocationPicker(false);
    setError("");
  };
  const badge = Object.keys(choices).length;
  return (
    <div
      className={
        step === 4 ? "live-app dashboard-mode" : "live-app profile-setup"
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
          <button onClick={() => setCart(!cart)}>
            Your profile <small className="pill">{badge}</small>
          </button>
          {step === 4 && (
            <button onClick={() => setStep(3)}>Edit priorities</button>
          )}
          <button onClick={reset}>Start again</button>
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
            <p className="fine-note">
              Your selected services stay with you. Cost assumptions reset for
              the new location.
            </p>
          </div>
        </LocationPicker>
      )}
      {step < 4 && (
        <section className="prompt">
          <div className="question-top">
            <span className="eyebrow">
              {step === 3
                ? "Your service priorities"
                : "Your household profile"}
            </span>
            <span className="question-location">Step {step + 1} of 4</span>
          </div>
          {step === 0 && (
            <>
              <h1>Where do you have in mind?</h1>
              <p className="question-hint">
                Choose a town or city in Ireland. We’ll start with the evidence
                around it.
              </p>
              <label className="input-label">
                <span>Town or city</span>
                <input
                  autoFocus
                  placeholder="Try Drogheda, Cork or Galway"
                  value={query}
                  onChange={(e) => {
                    placeVersion.current++;
                    setQuery(e.target.value);
                    setPlace(null);
                    setOrigin(null);
                  }}
                />
              </label>
              <div className="place-results">
                {places.map((p) => (
                  <button
                    key={p.id}
                    className={`choice ${place?.id === p.id ? "selected" : ""}`}
                    onClick={() => choosePlace(p)}
                  >
                    <strong>{p.name}</strong>
                    <small>{p.attributes.county ?? "CSO urban area"}</small>
                  </button>
                ))}
              </div>
              {place && (
                <p className="selection-note">
                  ✓ {place.name} selected · Census 2022 boundary
                </p>
              )}
              <p className="fine-note">
                CSO urban areas cover towns and cities. Rural localities may not
                appear.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <h1>Who are you finding a home for?</h1>
              <p className="question-hint">
                Your household needs shape your choices. These answers stay in
                memory during this visit.
              </p>
              <div className="profile-fields">
                <label>
                  Bedrooms
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={profile.bedrooms}
                    onChange={(e) =>
                      updateProfile({
                        bedrooms: Math.min(
                          12,
                          Math.max(1, Math.floor(Number(e.target.value))),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Children’s ages (optional)
                  <input
                    placeholder="For example: 3, 8"
                    value={profile.ages}
                    onChange={(e) => updateProfile({ ages: e.target.value })}
                  />
                </label>
                <label>
                  Looking to
                  <select
                    value={profile.tenure}
                    onChange={(e) =>
                      updateProfile({
                        tenure: e.target.value as "buy" | "rent",
                      })
                    }
                  >
                    <option value="rent">Rent</option>
                    <option value="buy">Buy</option>
                  </select>
                </label>
                <label>
                  {profile.tenure === "rent"
                    ? "Monthly housing budget (€)"
                    : "Purchase budget (€)"}
                  <input
                    type="number"
                    min="1"
                    placeholder={profile.tenure === "rent" ? "1800" : "350000"}
                    value={profile.budget}
                    onChange={(e) => updateProfile({ budget: e.target.value })}
                  />
                </label>
              </div>
              <p className="fine-note">
                Historical prices are area context. Available homes and bedroom
                matches are not verified.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <h1>How do you get around?</h1>
              <p className="question-hint">
                Choose your everyday mode and the area you want to explore.
              </p>
              <div className="choices">
                {[
                  ["driving", "Car"],
                  ["public_transport", "Public transport"],
                  ["cycling", "Cycling"],
                  ["walking", "Walking"],
                ].map(([value, name]) => (
                  <button
                    key={value}
                    className={`choice ${profile.mode === value ? "selected" : ""}`}
                    onClick={() =>
                      updateProfile({ mode: value as Profile["mode"] })
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
              <label className="radio-filter">
                <input
                  type="checkbox"
                  checked={profile.car}
                  onChange={(e) => updateProfile({ car: e.target.checked })}
                />
                A car is available to my household
              </label>
              <label className="input-label">
                <span>
                  Explore within {profile.radiusKm} km of the search anchor
                </span>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={profile.radiusKm}
                  onChange={(e) =>
                    updateProfile({ radiusKm: Number(e.target.value) })
                  }
                />
              </label>
              <p className="fine-note">
                Journey times need routing and timetables. Map distances alone
                do not verify access.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <h1>What matters to you?</h1>
              <p className="question-hint">
                Choose any number of criteria, then mark what is required or
                preferred.
              </p>
              <Criteria
                registry={registry}
                choices={choices}
                toggle={toggle}
                change={changeChoice}
              />
            </>
          )}
          <div className="question-actions">
            <button
              className="back"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              ← Back
            </button>
            <button
              className="primary"
              disabled={
                loading ||
                (step === 0 && (!place || !origin)) ||
                (step === 3 && !badge) ||
                !registry.length
              }
              onClick={() => (step === 3 ? load() : setStep(step + 1))}
            >
              {loading
                ? "Reading source evidence…"
                : step === 3
                  ? "Explore this area →"
                  : "Continue →"}
            </button>
          </div>
        </section>
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
            onEdit={() => setStep(3)}
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
        <aside className="profile-cart">
          <div className="cart-heading">
            <h2>Your household profile</h2>
            <button onClick={() => setCart(false)} aria-label="Close profile">
              ×
            </button>
          </div>
          <div className="cart-profile">
            <strong>{place?.name ?? "Location not selected"}</strong>
            <small>
              {profile.bedrooms}+ bedrooms ·{" "}
              {profile.tenure === "rent" ? "Renting" : "Buying"}
            </small>
            <small>
              {profile.mode.replace("_", " ")} ·{" "}
              {profile.car ? "Car available" : "No car"}
            </small>
            <small>
              {profile.ages
                ? `Children’s ages: ${profile.ages}`
                : "Children’s ages not specified"}
            </small>
          </div>
          <div className="cart-criteria">
            <h3>
              Selected priorities <span>{badge}</span>
            </h3>
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
          <button
            className="outline-button"
            onClick={() => {
              setCart(false);
              setStep(1);
            }}
          >
            Edit household & transport
          </button>
          <p className="fine-note">
            Your profile is held in memory for this visit.
          </p>
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
}: {
  registry: Criterion[];
  choices: Record<string, Choice>;
  toggle: (id: string) => void;
  change: (id: string, patch: Partial<Choice>) => void;
}) {
  return (
    <div className="criteria-editor">
      {[...new Set(registry.map((c) => c.vertical))].map((vertical) => (
        <details key={vertical} className="filter-section" open>
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

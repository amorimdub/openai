import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  api,
  calculateCosts,
  combinedFeatures,
  label,
  pillarColors,
  pillarLabels,
  type Choice,
  type CostInputs,
  type Criterion,
  type Layer,
  type Place,
  type Profile,
} from "./domain";
import { MapView } from "./Map";
const money = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const title = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const distance = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
type Props = {
  place: Place;
  origin: { longitude: number; latitude: number };
  anchorLabel: string;
  profile: Profile;
  choices: Record<string, Choice>;
  registry: Criterion[];
  layers: Layer[];
  assessment: any;
  loading: boolean;
  dirty: boolean;
  onPick: (p: { longitude: number; latitude: number }) => void;
  onUpdate: () => void;
  onChangeLocation: () => void;
  onEdit: () => void;
  onMore: (id: string) => Promise<void>;
  costs: CostInputs;
  setCosts: Dispatch<SetStateAction<CostInputs>>;
  serviceCosts: Record<string, string>;
  setServiceCosts: Dispatch<SetStateAction<Record<string, string>>>;
  costSource: string;
  setCostSource: Dispatch<SetStateAction<string>>;
};
export function Dashboard({
  place,
  origin,
  anchorLabel,
  profile,
  choices,
  registry,
  layers,
  assessment,
  loading,
  dirty,
  onPick,
  onUpdate,
  onChangeLocation,
  onEdit,
  onMore,
  costs,
  setCosts,
  serviceCosts,
  setServiceCosts,
  costSource,
  setCostSource,
}: Props) {
  const [hidden, setHidden] = useState<string[]>([]),
    [focused, setFocused] = useState(""),
    [paging, setPaging] = useState(""),
    [pageError, setPageError] = useState("");
  const [marketRegions, setMarketRegions] = useState<any[]>([]),
    [marketRegion, setMarketRegion] = useState(""),
    [market, setMarket] = useState<any[]>([]),
    [marketSources, setMarketSources] = useState<any[]>([]),
    [marketLoading, setMarketLoading] = useState(false),
    [marketError, setMarketError] = useState(""),
    [regionRetry, setRegionRetry] = useState(0);
  useEffect(() => {
    setHidden((previous) =>
      previous.filter((id) => layers.some((layer) => layer.id === id)),
    );
    if (focused && !layers.some((layer) => layer.id === focused))
      setFocused("");
  }, [layers, focused]);
  const marketRequest = useRef(0);
  useEffect(() => {
    setMarketRegion("");
    setMarket([]);
    setMarketSources([]);
    setHidden([]);
    setFocused("");
    setPageError("");
    marketRequest.current++;
  }, [place.id, profile.tenure]);
  useEffect(() => {
    const abort = new AbortController();
    setMarketRegions([]);
    setMarketError("");
    api(
      `/market-geographies?tenure=${profile.tenure}&limit=1000`,
      undefined,
      abort.signal,
    )
      .then((r) => setMarketRegions(r.geographies ?? []))
      .catch((e) => {
        if (e.name !== "AbortError")
          setMarketError("Market-region data could not be loaded.");
      });
    return () => abort.abort();
  }, [profile.tenure, regionRetry]);
  useEffect(() => {
    const abort = new AbortController();
    const request = ++marketRequest.current;
    setMarket([]);
    setMarketSources([]);
    setMarketError("");
    if (!marketRegion) {
      setMarketLoading(false);
      return () => abort.abort();
    }
    const region = marketRegions.find(
      (r) => `${r.codeSystem}|${r.code}` === marketRegion,
    );
    if (!region) return () => abort.abort();
    setMarketLoading(true);
    api(
      `/market-context?${new URLSearchParams({ geographyCode: region.code, geographyCodeSystem: region.codeSystem, tenure: profile.tenure, ...(region.latestPeriod ? { period: region.latestPeriod } : {}), limit: "250" })}`,
      undefined,
      abort.signal,
    )
      .then((r) => {
        if (request !== marketRequest.current) return;
        setMarket(
          r.records
            .filter(
              (record: any) =>
                record.attributes.amountEur !== null &&
                record.attributes.observationStatus === "reported",
            )
            .sort((a: any, b: any) =>
              b.attributes.period.localeCompare(a.attributes.period),
            )
            .slice(0, 8),
        );
        setMarketSources(r.sources ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError" && request === marketRequest.current)
          setMarketError(e.message);
      })
      .finally(() => {
        if (request === marketRequest.current) setMarketLoading(false);
      });
    return () => abort.abort();
  }, [marketRegion, profile.tenure, marketRegions, regionRetry]);
  const name = (id: string) => {
    const criterion = registry.find((c) => c.id === id);
    return criterion ? title(label(criterion)) : id;
  };
  const mapLayers = layers.filter((l) => !hidden.includes(l.id));
  const allFeatures = combinedFeatures(layers),
    mapFeatures = combinedFeatures(mapLayers);
  const sources = [
    ...new Map(
      layers.flatMap((l) => l.sources).map((s) => [s.snapshotId, s]),
    ).values(),
  ];
  const withRecords = layers.filter((l) => l.data.features.length > 0).length;
  const missing = layers.filter((l) => !l.data.features.length);
  const requiredMissing = assessment?.aggregate?.requiredEvidenceMissing ?? [];
  const selectedIds = Object.keys(choices),
    estimate = calculateCosts(profile.tenure, costs, serviceCosts, selectedIds);
  const changeCost = (key: keyof CostInputs, value: string) => {
    setCosts((c) => ({ ...c, [key]: value }));
    if (["rent", "price"].includes(key)) setCostSource("");
  };
  const input = (
    key: keyof CostInputs,
    text: string,
    placeholder = "Enter amount",
    max?: number,
  ) => (
    <label>
      {text}
      <div className="amount-input">
        <span>{["years", "rate"].includes(key) ? "" : "€"}</span>
        <input
          aria-label={text}
          type="number"
          min="0"
          {...(max ? { max } : {})}
          step={key === "rate" ? "0.01" : "any"}
          placeholder={placeholder}
          value={costs[key]}
          onChange={(e) => changeCost(key, e.target.value)}
        />
        {key === "rate" && <span>%</span>}
        {key === "years" && <span>years</span>}
      </div>
    </label>
  );
  const active = layers.find((l) => l.id === focused);
  const selectedRegion = marketRegions.find(
    (r) => `${r.codeSystem}|${r.code}` === marketRegion,
  );
  return (
    <main className="dashboard area-dashboard" aria-busy={loading}>
      <div className="results-context">
        <span>YOUR LOCATION REVIEW</span>
        <button onClick={onChangeLocation}>⌖ Change location</button>
      </div>
      <div className="results-title">
        <div>
          <h1>
            {place.name}
            <span className="county">
              {place.attributes.county ?? "Ireland"}
            </span>
          </h1>
          <p>
            {profile.bedrooms}+ bedrooms ·{" "}
            {profile.tenure === "rent" ? "Renting" : "Buying"} · Exploring{" "}
            {profile.radiusKm} km around your anchor
          </p>
        </div>
        <button className="outline-button" onClick={onEdit}>
          Edit your criteria ↗
        </button>
      </div>
      {(dirty || loading) && (
        <div className="pending-banner" role="status">
          {loading
            ? "Updating the review for your location and services…"
            : "Your selections have changed. Apply them to refresh the review and map."}
          {!loading && (
            <button className="primary" onClick={onUpdate}>
              Update review
            </button>
          )}
        </div>
      )}
      <section className="review-hero" id="overview">
        <div>
          <span className="eyebrow">A clearer picture of this place</span>
          <h2>Your priorities. The local evidence.</h2>
          <p>
            {layers.length
              ? `${withRecords} of ${layers.length} selected criteria have mapped records in this area.`
              : "Choose services and update your review to see the local evidence."}{" "}
            Explore the services, check the gaps, and build a budget around your
            household.
          </p>
          <div className="hero-tags">
            <span>⌖ {anchorLabel}</span>
            <span>Fit score pending evidence</span>
          </div>
        </div>
        <div className="review-highlights">
          <strong>What the data tells us</strong>
          <p>
            <span className="positive-dot">●</span> {allFeatures.length}{" "}
            distinct mapped records across your services
          </p>
          <p>
            <span className="positive-dot">●</span> {sources.length} source
            snapshots available to review
          </p>
          <p>
            <span className="warning-dot">●</span>{" "}
            {requiredMissing.length
              ? `${requiredMissing.length} required ${requiredMissing.length === 1 ? "criterion still needs" : "criteria still need"} suitability evidence`
              : "Access, availability and journey times need verification"}
          </p>
          {missing.length > 0 && (
            <p>
              <span className="warning-dot">●</span> {missing.length} criteria
              have no mapped records returned
            </p>
          )}
        </div>
      </section>
      <div className="area-kpis">
        <div>
          <small>Mapped records</small>
          <strong>{allFeatures.length.toLocaleString("en-IE")}</strong>
          <span>Distinct records · loaded pages</span>
        </div>
        <div>
          <small>Criteria with map evidence</small>
          <strong>
            {withRecords}
            <em> / {layers.length}</em>
          </strong>
          <span>Coverage, not a suitability score</span>
        </div>
        <div>
          <small>Monthly cost estimate</small>
          <strong>{estimate.entered ? money(estimate.subtotal) : "—"}</strong>
          <span>
            {estimate.entered
              ? estimate.complete
                ? "All cost fields entered"
                : "Subtotal · some costs missing"
              : "Add your costs below"}
          </span>
        </div>
        <div>
          <small>Budget headroom</small>
          <strong
            className={
              estimate.headroom !== null && estimate.headroom < 0
                ? "over-budget"
                : ""
            }
          >
            {estimate.headroom === null ? "—" : money(estimate.headroom)}
          </strong>
          <span>
            {estimate.headroom === null
              ? "Needs complete costs and a budget"
              : estimate.headroom < 0
                ? "Above your monthly budget"
                : "Within your monthly budget"}
          </span>
        </div>
      </div>
      <section className="map-panel dashboard-panel" id="area-map">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">See everything together</span>
            <h2>Your area at a glance</h2>
            <p>
              Toggle services to explore how they connect around your location.
            </p>
          </div>
          <span className="subtle-badge">
            {mapFeatures.length} distinct records on map
          </span>
        </div>
        <div className="map-layout">
          <div className="map-controls">
            <div className="control-heading">
              <strong>Show on map</strong>
              <button onClick={() => setHidden([])}>Show all</button>
            </div>
            {layers.map((l) => (
              <label className="map-layer-control" key={l.id}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(l.id)}
                  onChange={() =>
                    setHidden((h) =>
                      h.includes(l.id)
                        ? h.filter((id) => id !== l.id)
                        : [...h, l.id],
                    )
                  }
                />
                <i
                  style={{ background: pillarColors[l.vertical] ?? "#657d8e" }}
                />
                <span>{name(l.id)}</span>
                <small>
                  {l.data.features.length}
                  {l.nextCursor ? "+" : ""}
                </small>
              </label>
            ))}
            {!layers.length && (
              <p className="fine-note">
                Your selected services will appear here after updating the
                review.
              </p>
            )}
            <div className="map-key">
              <span>
                <i className="anchor-dot" /> Your search anchor
              </span>
              <span>
                <i className="boundary-key" /> Town boundary
              </span>
              <span>
                <i className="radius-key" /> {profile.radiusKm} km search radius
              </span>
            </div>
            <p className="fine-note">
              Counts reflect loaded pages. “+” means more records are available.
              Lines and areas are shown as well as points.
            </p>
          </div>
          <div className="map-stage">
            <MapView
              place={place}
              origin={origin}
              radiusKm={profile.radiusKm}
              features={mapFeatures}
              onPick={onPick}
            />
            <p className="map-demo-note">
              {anchorLabel} · {origin.latitude.toFixed(4)},{" "}
              {origin.longitude.toFixed(4)}. Click the map to move the anchor
              and refresh this review. The radius measures geographic distance.
            </p>
          </div>
        </div>
      </section>
      <section id="service-review" className="service-review">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Matched to your selected services</span>
            <h2>Your full service review</h2>
            <p>
              Recorded locations and distances, with source coverage and
              suitability shown separately.
            </p>
          </div>
          <button className="outline-button" onClick={onEdit}>
            Choose services
          </button>
        </div>
        <div className="review-grid">
          {[...new Set(layers.map((l) => l.vertical))].map((vertical) => (
            <section className="service-card dashboard-panel" key={vertical}>
              <div className="service-card-heading">
                <span
                  className="category-icon"
                  style={{ background: pillarColors[vertical] }}
                >
                  {" "}
                  {vertical === "health"
                    ? "✚"
                    : vertical === "education"
                      ? "◇"
                      : vertical === "budget"
                        ? "€"
                        : vertical === "utilities"
                          ? "ϟ"
                          : "⌖"}
                </span>
                <h3>{pillarLabels[vertical] ?? title(vertical)}</h3>
                <span>
                  {
                    combinedFeatures(
                      layers.filter((l) => l.vertical === vertical),
                    ).length
                  }{" "}
                  mapped
                </span>
              </div>
              {layers
                .filter((l) => l.vertical === vertical)
                .map((l) => {
                  const result = assessment?.results?.find(
                    (r: any) => r.id === l.id,
                  );
                  const nearest =
                    result?.metric?.type === "recorded_point_distance_m"
                      ? result.metric.value
                      : null;
                  return (
                    <div className="review-service" key={l.id}>
                      <div className="service-row">
                        <strong>{name(l.id)}</strong>
                        <small className="importance-badge">
                          {choices[l.id]?.importance}
                        </small>
                      </div>
                      <div className="service-metrics">
                        <span>
                          <b>
                            {l.data.features.length}
                            {l.nextCursor ? "+" : ""}
                          </b>{" "}
                          loaded records
                        </span>
                        <span>
                          <b>
                            {nearest === null ? "Unknown" : distance(nearest)}
                          </b>{" "}
                          nearest recorded point
                          {nearest !== null ? " · within 50 km" : ""}
                        </span>
                      </div>
                      <p className="service-provenance">
                        {l.sources
                          .map(
                            (source) =>
                              `${source.publisher} · ${source.observedPeriod ?? "Date unknown"}`,
                          )
                          .join(" / ") || "Source coverage unknown"}
                      </p>
                      <p className="evidence-note">
                        {result?.reason ?? l.explanation}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFocused(l.id);
                          document.getElementById("records")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                      >
                        Review records & sources →
                      </button>
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
      </section>
      <section className="dashboard-panel records-panel" id="records">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Inspect the evidence</span>
            <h2>Local records & sources</h2>
          </div>
          <label className="record-selector">
            Service
            <select
              aria-label="Review service records"
              value={focused}
              onChange={(e) => setFocused(e.target.value)}
            >
              <option value="">Choose a service</option>
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {name(l.id)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!active ? (
          <p className="empty-state">
            Select a service above to inspect its recorded locations, dates and
            limitations.
          </p>
        ) : (
          <>
            <p className="fine-note">{active.explanation}</p>
            <div className="records-table">
              <table>
                <thead>
                  <tr>
                    <th>Recorded feature</th>
                    <th>Geometry distance</th>
                    <th>Observed period</th>
                  </tr>
                </thead>
                <tbody>
                  {active.data.features.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <strong>{f.properties.name}</strong>
                        <small>
                          {title(f.properties.category)} ·{" "}
                          {f.geometry?.type ?? "Nonspatial"}
                        </small>
                      </td>
                      <td>
                        {Number.isFinite(f.properties.recordedGeometryDistanceM)
                          ? distance(f.properties.recordedGeometryDistanceM!)
                          : "Unknown"}
                      </td>
                      <td>{f.properties.observedPeriod ?? "Unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!active.data.features.length && (
                <p className="empty-state">
                  No mapped records returned. This does not establish that the
                  service is absent.
                </p>
              )}
            </div>
            <p className="fine-note">
              Geometry distance is measured to a recorded point, line or area.
              It is not a route, entrance distance or journey time.
            </p>
            {active.nextCursor && active.displayCategories && (
              <button
                className="outline-button"
                disabled={!!paging || loading || dirty}
                onClick={async () => {
                  setPaging(active.id);
                  setPageError("");
                  try {
                    await onMore(active.id);
                  } catch (e) {
                    setPageError((e as Error).message);
                  } finally {
                    setPaging("");
                  }
                }}
              >
                {paging ? "Loading records…" : "Load more records onto the map"}
              </button>
            )}
            {pageError && (
              <p role="alert" className="market-error">
                {pageError}
              </p>
            )}
            <details className="source-details">
              <summary>
                Publisher sources, dates and limitations (
                {active.sources.length})
              </summary>
              {active.sources.map((source) => (
                <div key={source.snapshotId}>
                  <strong>{source.publisher}</strong>
                  <p>
                    Observed: {source.observedPeriod ?? "Unknown"} ·{" "}
                    {source.license}
                  </p>
                  <p>{source.limitations.join(" ")}</p>
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    Publisher source ↗
                  </a>
                </div>
              ))}
            </details>
          </>
        )}
      </section>
      <section className="dashboard-panel cost-panel" id="costs">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Make the numbers work for you</span>
            <h2>Cost & practicality</h2>
            <p>
              Build a monthly estimate for {place.name}. Your amounts update the
              total immediately.
            </p>
          </div>
          <span className="subtle-badge">Your household assumptions</span>
        </div>
        <div className="cost-layout">
          <div className="cost-editor">
            <h3>
              {profile.tenure === "rent"
                ? "Housing & everyday costs"
                : "Mortgage & everyday costs"}
            </h3>
            <div className="cost-fields">
              {profile.tenure === "rent" ? (
                input("rent", "Monthly rent")
              ) : (
                <>
                  {input("price", "Purchase price")}
                  {input("deposit", "Deposit amount")}
                  {input("rate", "Annual interest rate", "Enter rate", 100)}
                  {input("years", "Mortgage term", "Enter years", 50)}
                </>
              )}
              {input("transport", "Monthly transport")}
              {input("utilities", "Monthly utilities")}
              {input("other", "Other monthly household costs")}
              {input("monthlyBudget", "Total monthly household budget")}
            </div>
            {costSource && (
              <p className="fine-note">
                Housing assumption from {costSource}. Historical area context;
                confirm your actual housing cost.
              </p>
            )}
            {profile.tenure === "buy" &&
              costs.price &&
              estimate.parts[0].amount === null && (
                <p className="fine-note">
                  Enter a positive purchase price, deposit no higher than the
                  price, annual rate (0–100%) and a term greater than 0 and no
                  more than 50 years.
                </p>
              )}
            <h3>Selected service costs</h3>
            <p className="fine-note">
              Add recurring out-of-pocket costs, such as childcare or club
              membership. Enter 0 when a selected service adds no monthly cost.
              Include each expense once.
            </p>
            <div className="cost-fields">
              {selectedIds.map((id) => (
                <label key={id}>
                  {name(id)} / month
                  <div className="amount-input">
                    <span>€</span>
                    <input
                      aria-label={`${name(id)} monthly cost`}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Unknown"
                      value={serviceCosts[id] ?? ""}
                      onChange={(e) =>
                        setServiceCosts((c) => ({ ...c, [id]: e.target.value }))
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="cost-summary">
            <span className="eyebrow">
              {estimate.complete
                ? "Estimated monthly total"
                : "Entered monthly subtotal"}
            </span>
            <strong className="cost-total">
              {estimate.entered ? money(estimate.subtotal) : "—"}
              <small> / month</small>
            </strong>
            <p>
              {estimate.missing
                ? `${estimate.missing} cost fields still need an amount. Missing values are not treated as confirmed zero costs.`
                : "All cost fields entered. This is an estimate based on your assumptions."}
            </p>
            <div className="cost-breakdown">
              {estimate.parts.map((p) => (
                <div key={p.id}>
                  <span>{p.label}</span>
                  <b>{p.amount === null ? "Unknown" : money(p.amount)}</b>
                </div>
              ))}
              <div>
                <span>Selected services</span>
                <b>
                  {!estimate.services.length ||
                  estimate.services.some((s) => s.amount !== null)
                    ? money(estimate.serviceTotal)
                    : "Unknown"}
                  {estimate.services.some((s) => s.amount === null) &&
                  estimate.services.some((s) => s.amount !== null)
                    ? " + unknown"
                    : ""}
                </b>
              </div>
            </div>
            <div className="cost-bar" aria-hidden="true">
              {[
                ...estimate.parts.map((p) => p.amount ?? 0),
                estimate.serviceTotal,
              ].map((amount, index) => (
                <span
                  key={index}
                  style={{
                    flex: amount,
                    background: [
                      "#4684c4",
                      "#8263bc",
                      "#469768",
                      "#bd882f",
                      "#dc6376",
                    ][index],
                  }}
                />
              ))}
            </div>
            <div
              className={`budget-status ${estimate.headroom !== null && estimate.headroom < 0 ? "over-budget" : ""}`}
            >
              <strong>
                {estimate.headroom === null
                  ? "Budget comparison pending"
                  : `${money(Math.abs(estimate.headroom))} ${estimate.headroom < 0 ? "above budget" : "remaining"}`}
              </strong>
              <p>
                {estimate.headroom === null
                  ? "Enter all costs and your total monthly budget to calculate headroom."
                  : `Compared with ${money(estimate.budget!)} / month.`}
              </p>
            </div>
            <p className="fine-note">
              {profile.tenure === "buy"
                ? "Repayment uses a constant interest rate and monthly amortisation. Deposit and purchase fees are upfront and excluded. "
                : ""}
              Add insurance, taxes and other recurring expenses to household
              costs. No service prices are inferred from map records.
            </p>
          </div>
        </div>
        <details className="market-context">
          <summary>
            Check historical housing data to inform your estimate
          </summary>
          <p className="fine-note">
            Choose a publisher geography explicitly. There is no verified
            town-to-market-region join; records are not filtered to your{" "}
            {profile.bedrooms}+ bedroom preference. Showing up to eight reported
            observations from the latest publisher period.
          </p>
          <label>
            Publisher market region
            <select
              aria-label="Publisher market region"
              value={marketRegion}
              onChange={(e) => setMarketRegion(e.target.value)}
            >
              <option value="">Select a source geography</option>
              {marketRegions.map((r) => (
                <option
                  key={`${r.codeSystem}|${r.code}`}
                  value={`${r.codeSystem}|${r.code}`}
                >
                  {r.name} · {r.codeSystem}
                </option>
              ))}
            </select>
          </label>
          {marketError && (
            <p className="market-error" role="alert">
              {marketError}{" "}
              <button onClick={() => setRegionRetry((n) => n + 1)}>
                Retry market data
              </button>
            </p>
          )}
          {marketLoading && (
            <p role="status">Loading historical observations…</p>
          )}
          {marketRegion && !marketLoading && !market.length && !marketError && (
            <p className="empty-state">
              No reported amounts returned for this source geography.
            </p>
          )}
          <div className="market-grid">
            {market.map((r) => (
              <div key={r.id}>
                <strong>
                  {money(r.attributes.amountEur)}
                  {r.attributes.unit === "EUR/month" ? " / month" : ""}
                </strong>
                <span>
                  {title(r.attributes.statistic)} ·{" "}
                  {r.attributes.propertyTypeLabel}
                </span>
                <small>
                  {r.attributes.geography.name} · {r.attributes.period}
                  {r.attributes.bedroomClass
                    ? ` · ${selectedRegion?.bedroomClasses?.find((b: any) => String(b.code) === String(r.attributes.bedroomClass))?.label ?? `Bedroom class ${r.attributes.bedroomClass}`}`
                    : ""}
                </small>
                <button
                  className="text-button"
                  onClick={() => {
                    setCosts((c) => ({
                      ...c,
                      [profile.tenure === "rent" ? "rent" : "price"]: String(
                        r.attributes.amountEur,
                      ),
                    }));
                    setCostSource(
                      `${r.attributes.geography.name} · ${r.attributes.period} · ${title(r.attributes.statistic)} · ${r.attributes.propertyTypeLabel}${r.attributes.bedroomClass ? ` · bedroom class ${r.attributes.bedroomClass}` : ""}`,
                    );
                  }}
                >
                  Use as housing assumption ↗
                </button>
              </div>
            ))}
          </div>
          {marketSources.map((s) => (
            <div key={s.snapshotId} className="market-source">
              <strong>{s.publisher}</strong>
              <p className="fine-note">
                {s.observedPeriod ?? "Observation date unknown"} · {s.license} ·{" "}
                {s.limitations.join(" ")}
              </p>
              <a
                className="text-button"
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Publisher source ↗
              </a>
            </div>
          ))}
        </details>
      </section>
      <section className="dashboard-panel coverage-panel" id="data-sources">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Know what is behind the review</span>
            <h2>Data coverage & limitations</h2>
          </div>
          <span className="subtle-badge">
            {sources.length} source snapshots
          </span>
        </div>
        <p className="fine-note">
          KPIs refer to this anchor, radius and applied criteria. Partial
          coverage does not prove suitability or absence. Required criteria
          still need evidence of access and availability. Fit scores remain
          unknown.
        </p>
        <div className="coverage-grid">
          {sources.map((s) => (
            <details key={s.snapshotId}>
              <summary>
                {s.publisher}
                <small>{s.observedPeriod ?? "Observation date unknown"}</small>
              </summary>
              <p className="fine-note">
                {s.license} · {s.limitations.join(" ")}
              </p>
              <a
                className="text-button"
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Publisher source ↗
              </a>
            </details>
          ))}
        </div>
        {!sources.length && (
          <p className="empty-state">
            No mapped source evidence has been returned for this selection.
          </p>
        )}
      </section>
    </main>
  );
}

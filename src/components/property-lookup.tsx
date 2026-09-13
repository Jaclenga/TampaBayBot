"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, MapPin, Search } from "lucide-react";
import type {
  AddressCandidate,
  AddressLookup,
  LayerResult,
  PropertyContext,
} from "@/lib/geospatial/index.mjs";
import type { NearbyDevelopment } from "@/lib/development/index.mjs";
import { en } from "@/lib/i18n/en";
import { propertyEn as copy } from "@/lib/i18n/property-en";
import { SourceLink } from "./site-shell";
import { dateLabel } from "@/lib/i18n/format";

async function post<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || copy.geoError);
  return data;
}
function Layer({ layer, title }: { layer?: LayerResult; title: string }) {
  if (!layer) return null;
  return (
    <section className="property-layer">
      <h4>{title}</h4>
      {copy.layerStates[layer.status] && (
        <p className="small">{copy.layerStates[layer.status]}</p>
      )}
      {layer.records.length ? (
        layer.records.map((record) => (
          <div key={record.id} className="property-record">
            <strong>{record.label}</strong>
            <p>{record.description}</p>
            {record.pin && (
              <p className="small">
                {copy.pinLabel}: {record.pin}
              </p>
            )}
            <SourceLink url={record.sourceUrl}>{copy.source}</SourceLink>
            <small>
              {layer.agency} · {dateLabel(record.retrievedAt)} ·{" "}
              {copy.recordNumber(record.id)}
            </small>
            {record.sourceUpdatedAt && (
              <small>
                {copy.featureUpdated}: {dateLabel(record.sourceUpdatedAt)}
              </small>
            )}
          </div>
        ))
      ) : (
        <p>{layer.message || copy.unknown}</p>
      )}
      {!layer.records.length && layer.sourceUrl && (
        <SourceLink url={layer.sourceUrl}>{copy.source}</SourceLink>
      )}
      {layer.message && layer.records.length > 0 && (
        <p className="small muted">{layer.message}</p>
      )}
    </section>
  );
}
export default function PropertyLookup({
  initialAddress = "",
}: {
  initialAddress?: string;
}) {
  const [address, setAddress] = useState(initialAddress);
  const [lookup, setLookup] = useState<AddressLookup | null>(null);
  const [point, setPoint] = useState<AddressCandidate | null>(null);
  const [property, setProperty] = useState<PropertyContext | null>(null);
  const [development, setDevelopment] = useState<NearbyDevelopment | null>(
    null,
  );
  const [radius, setRadius] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [error, setError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const request = useRef<AbortController | null>(null);
  const activityRequest = useRef<AbortController | null>(null);
  const matchesRef = useRef<HTMLHeadingElement>(null);
  const propertyRef = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      activityRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (lookup && !point) matchesRef.current?.focus();
  }, [lookup, point]);
  useEffect(() => {
    if (property) propertyRef.current?.focus();
  }, [property]);
  function resetSelection() {
    request.current?.abort();
    activityRequest.current?.abort();
    setPoint(null);
    setProperty(null);
    setDevelopment(null);
    setBusy(false);
    setActivityBusy(false);
    setError("");
    setActivityError("");
    setShowMap(false);
  }
  async function searchAddress() {
    if (!address.trim()) {
      setError(en.form.empty);
      return;
    }
    resetSelection();
    const ctl = new AbortController();
    request.current = ctl;
    setBusy(true);
    setLookup(null);
    try {
      const result = await post<AddressLookup>(
        "/api/location",
        { address },
        ctl.signal,
      );
      if (!ctl.signal.aborted) setLookup(result);
    } catch (err) {
      if (!ctl.signal.aborted)
        setError(err instanceof Error ? err.message : copy.geoError);
    } finally {
      if (!ctl.signal.aborted) setBusy(false);
    }
  }
  async function loadActivity(selected: AddressCandidate, meters: number) {
    activityRequest.current?.abort();
    const ctl = new AbortController();
    activityRequest.current = ctl;
    setActivityBusy(true);
    setActivityError("");
    setDevelopment(null);
    try {
      const result = await post<NearbyDevelopment>(
        "/api/development",
        { ...selected, radiusMeters: meters },
        ctl.signal,
      );
      if (!ctl.signal.aborted) setDevelopment(result);
    } catch (err) {
      if (!ctl.signal.aborted)
        setActivityError(err instanceof Error ? err.message : copy.geoError);
    } finally {
      if (!ctl.signal.aborted) setActivityBusy(false);
    }
  }
  async function choose(selected: AddressCandidate) {
    request.current?.abort();
    const ctl = new AbortController();
    request.current = ctl;
    setPoint(selected);
    setBusy(true);
    setError("");
    setProperty(null);
    setShowMap(false);
    void loadActivity(selected, radius);
    try {
      const result = await post<PropertyContext>(
        "/api/property",
        selected,
        ctl.signal,
      );
      if (!ctl.signal.aborted) setProperty(result);
    } catch (err) {
      if (!ctl.signal.aborted)
        setError(err instanceof Error ? err.message : copy.geoError);
    } finally {
      if (!ctl.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="property-panel" aria-labelledby="property-search-title">
      <h3 id="property-search-title">
        <MapPin size={21} aria-hidden="true" />
        {copy.title}
      </h3>
      <p className="small muted">{copy.optional}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void searchAddress();
        }}
      >
        <label htmlFor="address">{copy.label}</label>
        <div className="address-input">
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={copy.placeholder}
            maxLength={200}
            autoComplete="off"
            aria-describedby={
              error ? "address-disclosure address-error" : "address-disclosure"
            }
          />
          <button className="primary-button" type="submit" disabled={busy}>
            <Search size={17} aria-hidden="true" />
            {copy.submit}
          </button>
        </div>
        <p className="small muted" id="address-disclosure">
          {copy.disclosure}
        </p>
      </form>
      {error && (
        <p role="alert" id="address-error" className="error-text">
          {error}
        </p>
      )}
      <p role="status" className="small">
        {busy ? (point ? copy.loading : copy.busy) : ""}
      </p>
      {lookup && !point && (
        <div className="address-matches">
          <h4 ref={matchesRef} tabIndex={-1}>
            {copy.select}
          </h4>
          <p>{lookup.message}</p>
          {!!lookup.warnings?.length && (
            <ul className="warning-list">
              {lookup.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {lookup.candidates.map((candidate) => (
            <button
              className="candidate"
              key={candidate.id}
              onClick={() => void choose(candidate)}
            >
              <span>
                {candidate.address}
                <small>
                  {candidate.latitude.toFixed(5)},{" "}
                  {candidate.longitude.toFixed(5)}
                </small>
              </span>
              <span>
                {copy.choose}
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </button>
          ))}
          {lookup.candidates[0] && (
            <p className="small">
              <SourceLink url={lookup.candidates[0].sourceUrl}>
                {copy.matchSource}
              </SourceLink>{" "}
              · {copy.retrievedLabel}: {dateLabel(lookup.retrievedAt)}
            </p>
          )}
        </div>
      )}
      {point && (
        <div className="selected-property">
          <h3 tabIndex={-1} ref={propertyRef}>
            {copy.titleResult}
          </h3>
          <p className="selected-address">
            <MapPin size={17} aria-hidden="true" />
            {point.address}
          </p>
          <p className="small muted">
            {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
            {property?.jurisdiction && ` · ${property.jurisdiction}`}
          </p>
          {property?.boundary && (
            <p className="small">
              <SourceLink
                url={
                  property.boundary.records[0]?.sourceUrl ??
                  property.boundary.sourceUrl
                }
              >
                {copy.jurisdictionSource}
              </SourceLink>
            </p>
          )}
          {lookup && (
            <button
              className="text-button"
              onClick={resetSelection}
            >
              {copy.chooseDifferent}
            </button>
          )}
          {property && (
            <>
              <p>{property.message}</p>
              {property.parcelAnalysis && (
                <p className="small"><strong>{copy.parcelAnalysis}:</strong> {copy.parcelScopes[property.parcelAnalysis.scope]}</p>
              )}
              {property.municipalities && property.municipalities.status !== "not_found" && (
                <Layer layer={property.municipalities} title={property.municipalities.title} />
              )}
              {!property.boundary && !!property.boundaryChecks?.length && (
                <details className="data-limits">
                  <summary>{copy.boundaryChecks}</summary>
                  {property.boundaryChecks.map((layer) => (
                    <Layer key={layer.jurisdictionId} layer={layer} title={layer.title} />
                  ))}
                </details>
              )}
              {property.warnings.length > 0 && (
                <ul className="warning-list">
                  {property.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="property-layer-grid">
                <Layer layer={property.parcel} title={copy.parcel} />
                <Layer layer={property.zoning} title={copy.zoning} />
                <Layer
                  layer={property.futureLandUse}
                  title={copy.futureLandUse}
                />
              </div>
            </>
          )}
          {!showMap ? (
            <div className="map-consent">
              <button
                className="secondary-button"
                onClick={() => setShowMap(true)}
              >
                <MapPin size={16} aria-hidden="true" />
                {copy.map}
              </button>
              <p className="small muted">{copy.mapDisclosure}</p>
            </div>
          ) : (
            <iframe
              className="location-map"
              title={copy.mapTitle}
              loading="lazy"
              referrerPolicy="no-referrer"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent([point.longitude - 0.009, point.latitude - 0.005, point.longitude + 0.009, point.latitude + 0.005].join(","))}&layer=mapnik&marker=${point.latitude}%2C${point.longitude}`}
            />
          )}
          <section className="development-section">
            <div className="development-heading">
              <h3>{copy.nearby}</h3>
              <label className="radius-label">
                {copy.radius}
                <select
                  value={radius}
                  onChange={(e) => {
                    const meters = Number(e.target.value);
                    setRadius(meters);
                    void loadActivity(point, meters);
                  }}
                >
                  {[250, 500, 1000, 2000].map((m) => (
                    <option key={m} value={m}>
                      {m.toLocaleString("en-US")} {copy.meters}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="small muted">
              {copy.distance}. {copy.activityNote}
            </p>
            <p className="small" role="status">
              {activityBusy ? copy.loadingActivity : ""}
            </p>
            {activityError && (
              <p className="error-text" role="alert">
                {activityError}
              </p>
            )}
            {development && (
              <>
                <div className="independent-note">
                  <strong>{development.title || copy.projectTitle}</strong>
                  <span>{development.authoritativeStatus === "independent public-data project" ? copy.independent : development.authoritativeStatus === "official city GIS records" ? copy.official : development.authoritativeStatus}</span>
                  {development.sourceUrl && (
                    <SourceLink url={development.sourceUrl}>
                      {development.authoritativeStatus === "independent public-data project" ? copy.methodology : copy.sourceDetails}
                    </SourceLink>
                  )}
                </div>
                <p>{development.message}</p>
                {development.status === "potentially_outdated" && (
                  <p className="error-text" role="status">
                    {copy.staleAlert}
                  </p>
                )}
                <p className="small muted">
                  {development.status === "missing_coverage" ? copy.noDevelopmentQuery : (
                    <>
                      {development.sourceSnapshotDate ? <>{copy.snapshotLabel}: {dateLabel(development.sourceSnapshotDate)} · </> : <>{copy.liveLabel} · </>}
                      {copy.retrievedLabel}: {dateLabel(development.retrievedAt)}
                    </>
                  )}
                </p>
                {development.warnings.length > 0 && (
                  <details className="data-limits">
                    <summary>
                      {copy.coverageLimits}
                      <ChevronDown size={15} aria-hidden="true" />
                    </summary>
                    <p>{development.coverage}</p>
                    {development.services?.map((service) => (
                      <p key={service.sourceId}>
                        <SourceLink url={service.url}>{service.title}</SourceLink>: {service.status}. {service.coverage}
                      </p>
                    ))}
                    <ul>
                      {development.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {development.records.length > 0 && (
                  <>
                    <p className="small">
                      {copy.resultsCount(
                        development.records.length,
                        development.totalMatches,
                        development.radiusMeters,
                      )}
                    </p>
                    {development.totalMatchesExact === false && <p className="small">{copy.partialCount}</p>}
                    <ol className="development-records">
                      {development.records.map((record) => (
                        <li key={record.id}>
                          <div className="record-heading">
                            <strong>
                              {record.address ||
                                record.projectName ||
                                record.recordId}
                            </strong>
                            <span>
                              {record.distanceMeters === null ? copy.areaMatch : copy.distanceAway(record.distanceMeters)}
                            </span>
                          </div>
                          <p>
                            {record.recordType} ·{" "}
                            {record.status || copy.unknown}
                          </p>
                          {record.description && (
                            <details>
                              <summary>{copy.recordDescription}</summary>
                              <p>{record.description}</p>
                            </details>
                          )}
                          <p className="small muted">
                            {record.recordId} · {dateLabel(record.date)} (
                            {record.dateType.replaceAll("_", " ")})
                          </p>
                          {record.futureDated && (
                            <p className="small">{copy.futureDateAlert}</p>
                          )}
                          {record.originalSourceUrl && (
                            <SourceLink url={record.originalSourceUrl}>
                              {copy.record}
                            </SourceLink>
                          )}
                          {record.sourceEndpoint && (
                            <SourceLink url={record.sourceEndpoint}>
                              {copy.dataEndpoint}
                            </SourceLink>
                          )}
                          <SourceLink url={record.sourceUrl}>
                            {copy.provenance}
                          </SourceLink>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                {development.activityByYear.length > 0 && (
                  <details className="activity-history">
                    <summary>{copy.history}</summary>
                    <p className="small muted">{copy.historyExplanation}</p>
                    <table>
                      <caption>{copy.historyCaption}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{copy.year}</th>
                          <th scope="col">{copy.dateType}</th>
                          <th scope="col">{copy.historyRecords}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {development.activityByYear.map((item) => (
                          <tr key={`${item.year}-${item.dateType}`}>
                            <th scope="row">{item.year}</th>
                            <td>{item.dateType.replaceAll("_", " ")}</td>
                            <td>{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Maximize2, Minimize2, LocateFixed } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Marker,
  Polyline,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { VietnameseLabels } from "@/components/ship-data/VesselMap";
import "leaflet/dist/leaflet.css";
import "./superintendent/dashboard.css";
import { useTranslationSafe } from "@/contexts/I18nContext";
import { AppModal } from "@/components/common/AppModal";
import { canOpen } from "@/stores/permissions.store";
import {
  inspectionRows,
  sampleHazards,
  sampleRiskCounts,
  sampleWorkRest,
  sampleVesselTrack,
  sampleComplianceFeed,
} from "./superintendent/data";

const panelStyle =
  "rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800";
const inspectionColors = [
  "#2187b5",
  "#b9dce9",
  "#48b4a2",
  "#b9dcd5",
  "#facc15",
  "#f9e9a3",
  "#f97316",
  "#93c5fd",
];
const colors = ["#a3e8a2", "#168446", "#facc15", "#f97316", "#dc2626"];
type InspectionMetric = "recent" | "overdue" | "findings";
interface ActivityRow {
  name: string;
  status: string;
  detail: string;
}

function ModuleLink({ to }: { to: string }) {
  const { t } = useTranslationSafe();
  return canOpen(to.split("?")[0]) ? (
    <Link
      to={to}
      aria-label={t("superintendent.openModule")}
      className="inline-flex p-1 text-slate-400 hover:text-blue-600"
    >
      <ArrowUpRight size={14} />
    </Link>
  ) : null;
}
function Panel({
  title,
  to,
  children,
  className = "",
}: {
  title: string;
  to?: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslationSafe();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[79] bg-slate-900/40"
          onClick={() => setExpanded(false)}
        />
      )}
      <section
        data-expanded={expanded}
        className={`${panelStyle} superintendent-panel group flex min-w-0 flex-col ${expanded ? "fixed inset-5 z-[80]" : className}`}
      >
        <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <h2
            className="min-w-0 truncate text-sm font-semibold text-slate-700 dark:text-slate-100"
            title={title}
          >
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {to && <ModuleLink to={to} />}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={t(
                expanded ? "superintendent.collapse" : "superintendent.expand",
                { name: title },
              )}
              className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </header>
        <div className="superintendent-panel-body">{children}</div>
      </section>
    </>
  );
}
const previousPosition = sampleVesselTrack[sampleVesselTrack.length - 2];
const currentPosition = sampleVesselTrack[sampleVesselTrack.length - 1];
const vesselCourse =
  ((Math.atan2(
    (currentPosition[1] - previousPosition[1]) *
      Math.cos((currentPosition[0] * Math.PI) / 180),
    currentPosition[0] - previousPosition[0],
  ) *
    180) /
    Math.PI +
    360) %
  360;
const vesselIcon = L.divIcon({
  className: "superintendent-vessel-marker",
  html: `<svg width="48" height="48" viewBox="-24 -24 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="Vessel" style="overflow:visible">
    <g transform="rotate(${vesselCourse})">
      <path d="M0-20C-5-15-8-10-8-5V14L-5 18H5L8 14V-5C8-10 5-15 0-20Z" fill="#2563eb" stroke="#fff" stroke-width="2"/>
      <path d="M0-17V-10M-5-6H5V7H-5Z" fill="#93c5fd" stroke="#0f3c80" stroke-width="1"/>
      <path d="M-5-2H5M-5 2H5" stroke="#2563eb" stroke-width="1.5"/>
      <rect x="-5" y="9" width="10" height="5" rx="1" fill="#fff"/>
    </g>
  </svg>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24],
});

function MapFocus() {
  const map = useMap();
  const { t } = useTranslationSafe();
  useEffect(() => {
    map.fitBounds(
      [
        [7.5, 104.5],
        [18.5, 116.5],
      ],
      { padding: [20, 20] },
    );
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return (
    <button
      type="button"
      className="absolute right-3 top-3 z-[1000] inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow hover:bg-blue-50"
      onClick={(event) => {
        event.stopPropagation();
        map.flyTo(currentPosition, 9, { duration: 0.6 });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <LocateFixed size={16} />
      {t("superintendent.focusVessel")}
    </button>
  );
}

export function MarineSuperintendentPage() {
  const { t } = useTranslationSafe();
  const [metric, setMetric] = useState<InspectionMetric>("recent");
  const [inspection, setInspection] = useState<string | null>(null);
  const [activities, setActivities] = useState<{
    title: string;
    rows: ActivityRow[];
  } | null>(null);
  const auditName = (key: string) => t(`superintendent.audit.${key}`);
  const hazards = sampleHazards.map((item, index) => ({
    name: t(`superintendent.hazard.${index}`),
    ...item,
  }));
  const riskValues = sampleRiskCounts;
  const riskTotal = riskValues.reduce((sum, count) => sum + count, 0);
  const riskData = riskValues.map((value, index) => ({
    name: t(`superintendent.risk.${index}`),
    value,
  }));
  const chartRows = inspectionRows
    .filter((row) => !inspection || row.key === inspection)
    .map((row) => ({ name: auditName(row.key), value: row[metric] }));
  const total = (key: InspectionMetric) =>
    inspectionRows.reduce((sum, row) => sum + row[key], 0);
  const latitude = 10.15,
    longitude = 107.45;
  const vesselName = "HP PIONEER VMU";
  const drillStats = {
    totalScheduled: 18,
    totalCompleted: 13,
    totalOverdue: 2,
    totalUpcoming: 3,
  };
  const showInspections = (key: string, count: number, field: string) =>
    setActivities({
      title: `${auditName(key)} · ${t(`superintendent.${field}`)}`,
      rows: Array.from({ length: count }, (_, index) => ({
        name: `${auditName(key)} #${String(index + 1).padStart(3, "0")}`,
        status: t(`superintendent.${field}`),
        detail: t("superintendent.inspectionFollowUp"),
      })),
    });
  const showIncidents = () =>
    setActivities({
      title: t("superintendent.hazocc"),
      rows: hazards.flatMap((item) =>
        Array.from({ length: item.open }, (_, index) => ({
          name: `${item.name} #${index + 1}`,
          status: t("superintendent.open"),
          detail: t("superintendent.incidentFollowUp"),
        })),
      ),
    });
  const showRisks = () =>
    setActivities({
      title: t("superintendent.jsa"),
      rows: riskData.map((item) => ({
        name: item.name,
        status: String(item.value),
        detail: t("superintendent.assessed"),
      })),
    });
  return (
    <div
      className="superintendent-dashboard bg-gray-50 text-slate-700 dark:bg-gray-900 dark:text-slate-200"
      aria-label="Marine Superintendent Dashboard"
    >
      <aside
        className="superintendent-summary"
        tabIndex={0}
        aria-label={t("superintendent.safetyOverview")}
      >
        <section className={`${panelStyle} superintendent-table-card`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
            <h2 className="text-xs font-semibold uppercase text-blue-600">
              {t("superintendent.inspections")}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-blue-50 text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">
                    <span className="sr-only">{t("superintendent.type")}</span>
                  </th>
                  {[
                    "overdue",
                    "findings",
                    "overdueFindings",
                    "never",
                    "due",
                  ].map((key) => (
                    <th
                      key={key}
                      className="w-10 border-l border-gray-200 px-1 py-2 text-center font-medium"
                      title={t(`superintendent.${key}`)}
                    >
                      {t(`superintendent.short.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspectionRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-t border-gray-200 even:bg-gray-50"
                  >
                    <td className="px-2 py-2">{auditName(row.key)}</td>
                    {(
                      [
                        "overdue",
                        "findings",
                        "overdueFindings",
                        "never",
                        "due",
                      ] as const
                    ).map((key) => (
                      <td
                        key={key}
                        className="border-l border-gray-200 text-center"
                      >
                        <button
                          className={`w-full py-2 hover:bg-blue-50 hover:underline ${key === "overdue" || key === "overdueFindings" ? "text-red-600" : "text-slate-700 dark:text-slate-200"}`}
                          onClick={() => {
                            setInspection(row.key);
                            if (key === "overdue" || key === "findings")
                              setMetric(key);
                            showInspections(row.key, row[key], key);
                          }}
                        >
                          {row[key]}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className={panelStyle}>
          <h2 className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold uppercase text-blue-600">
            {t("superintendent.vesselStatus")}
          </h2>
          <dl className="divide-y divide-gray-100 text-xs">
            {[
              {
                label: t("superintendent.openOrders"),
                value: 12,
                to: "/pms/work-planning?tab=orders",
              },
              {
                label: t("superintendent.overdueDrills"),
                value: drillStats.totalOverdue,
                to: "/safety/drills",
              },
              {
                label: t("superintendent.certificatesDue"),
                value: 3,
                to: "/crew/certificates",
              },
              {
                label: t("superintendent.offHire"),
                value: 0,
                to: "/ship-data",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 px-3 py-2.5"
              >
                <dt className="flex items-center gap-1">
                  {item.label}
                  <ModuleLink to={item.to} />
                </dt>
                <dd className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {item.value}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={`${panelStyle} superintendent-table-card`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            <button
              onClick={showIncidents}
              className="text-xs font-semibold uppercase text-blue-600 hover:underline"
            >
              {t("superintendent.hazocc")}
            </button>
            <ModuleLink to="/safety/hsqe?tab=incidents" />
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-blue-50">
              <tr>
                <th className="p-2 text-left font-medium">
                  <span className="sr-only">{t("superintendent.type")}</span>
                </th>
                <th className="p-2 font-medium">{t("superintendent.open")}</th>
                <th className="p-2 font-medium">
                  {t("superintendent.closed")}
                </th>
              </tr>
            </thead>
            <tbody>
              {hazards.map((item) => (
                <tr
                  key={item.name}
                  className="border-t border-gray-200 even:bg-gray-50"
                >
                  <td className="p-2">{item.name}</td>
                  <td className="text-center">
                    <button
                      onClick={showIncidents}
                      className="p-1 text-red-600 hover:underline"
                    >
                      {item.open}
                    </button>
                  </td>
                  <td className="p-2 text-center">{item.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={panelStyle}>
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
            <button
              onClick={showRisks}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("superintendent.jsa")}
            </button>
            <ModuleLink to="/safety/hsqe?tab=permits" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-200 text-center text-xs">
            {[
              {
                label: t("superintendent.highRisk"),
                value: riskValues[3] + riskValues[4],
              },
              { label: t("superintendent.assessed"), value: riskTotal },
            ].map((item) => (
              <div key={item.label} className="px-1 py-3">
                <p className="mb-2 text-[10px] text-slate-500">{item.label}</p>
                <button
                  onClick={showRisks}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  {item.value}
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2 text-xs">
            <span>{t("superintendent.moc")}</span>
            <span className="font-semibold">2</span>
          </div>
        </section>
        <section className={panelStyle}>
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
            <h2 className="text-xs font-semibold uppercase text-blue-600">
              {t("superintendent.drills")}
            </h2>
            <ModuleLink to="/safety/drills" />
          </div>
          <div className="grid grid-cols-3 text-center text-xs">
            {[
              { name: "completed", value: drillStats.totalCompleted },
              { name: "scheduled", value: drillStats.totalUpcoming },
              { name: "overdue", value: drillStats.totalOverdue },
            ].map((item) => (
              <div key={item.name} className="py-3">
                <p className="mb-1 text-[10px] text-slate-500">
                  {t(`superintendent.${item.name}`)}
                </p>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>
      </aside>
      <div className="superintendent-workspace">
        <div className="superintendent-row">
          <Panel title={t("superintendent.inspections")} className="min-h-0">
            <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2">
              {(["recent", "overdue", "findings"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    setMetric(key);
                    setInspection(null);
                  }}
                  className={`border-b-2 px-2 py-2.5 text-xs ${metric === key ? "border-blue-600 font-medium text-blue-600" : "border-transparent text-slate-500"}`}
                >
                  {t(`superintendent.${key}`)}{" "}
                  <span className="tabular-nums">({total(key)})</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-[10px] text-slate-500">
              <span>
                {t(
                  `superintendent.${metric === "recent" ? "last30Days" : metric === "overdue" ? "overdueInspections" : "openInspectionFindings"}`,
                )}
              </span>
              {inspection && (
                <button
                  onClick={() => setInspection(null)}
                  className="text-blue-600"
                >
                  {t("superintendent.showAll")}
                </button>
              )}
            </div>
            <div className="superintendent-chart px-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows}
                  layout="vertical"
                  margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip cursor={{ fill: "#eff6ff" }} />
                  <Bar
                    key={metric}
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-out"
                    dataKey="value"
                    name={t(`superintendent.${metric}`)}
                    fill="#3b82f6"
                    maxBarSize={16}
                    onClick={(entry) => {
                      const row = inspectionRows.find(
                        (item) => auditName(item.key) === entry.name,
                      );
                      if (row) showInspections(row.key, row[metric], metric);
                    }}
                  >
                    {chartRows.map((row) => (
                      <Cell
                        key={row.name}
                        fill={
                          inspectionColors[
                            inspectionRows.findIndex(
                              (item) => auditName(item.key) === row.name,
                            )
                          ]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel
            title={t("superintendent.feed")}
            to="/safety/hsqe?tab=documents"
            className="min-h-0"
          >
            <div className="divide-y divide-gray-200">
              {sampleComplianceFeed.map((item, index) => (
                <article key={item.reference} className="px-3 py-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                    <CalendarDays size={11} />
                    {item.date} · {item.reference}
                  </p>
                  <h3 className="text-xs font-medium leading-5 text-slate-700 dark:text-slate-200">
                    {t(`superintendent.feedItems.${index}`)}
                  </h3>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {t(`superintendent.feedSummaries.${index}`)}
                  </p>
                </article>
              ))}
            </div>
          </Panel>
          <Panel
            title={t("superintendent.hazocc")}
            to="/safety/hsqe?tab=incidents"
            className="min-h-0"
          >
            <div className="superintendent-chart pt-5 pr-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hazards} layout="vertical">
                  <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar
                    isAnimationActive={false}
                    name={t("superintendent.open")}
                    dataKey="open"
                    stackId="a"
                    fill="#f59e0b"
                    maxBarSize={24}
                    onClick={showIncidents}
                  />
                  <Bar
                    isAnimationActive={false}
                    name={t("superintendent.closed")}
                    dataKey="closed"
                    stackId="a"
                    fill="#93c5fd"
                    maxBarSize={24}
                    onClick={showIncidents}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <div className="superintendent-row">
          <Panel
            title={t("superintendent.riskProfile")}
            to="/safety/hsqe?tab=permits"
            className="min-h-0"
          >
            <div className="relative superintendent-chart superintendent-risk-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={riskData}
                    dataKey="value"
                    innerRadius="61%"
                    outerRadius="85%"
                    paddingAngle={1}
                    onClick={showRisks}
                  >
                    {riskData.map((item, index) => (
                      <Cell key={item.name} fill={colors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    position={{ x: 8, y: 4 }}
                    wrapperStyle={{ pointerEvents: "none", zIndex: 10 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <button
                onClick={showRisks}
                className="absolute inset-0 m-auto flex h-20 w-20 flex-col items-center justify-center"
              >
                <span className="text-xs text-slate-400">
                  {t("superintendent.total")}
                </span>
                <strong className="text-3xl font-semibold tabular-nums text-slate-700 dark:text-slate-100">
                  {riskTotal}
                </strong>
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 px-3 text-[10px]">
              {riskData.map((item, index) => (
                <span key={item.name} className="flex items-center gap-1">
                  <i
                    className="h-2 w-2 rounded-full"
                    style={{ background: colors[index] }}
                  />
                  {item.name} ({item.value})
                </span>
              ))}
            </div>
            <p className="mt-3 px-3 text-[10px] leading-4 text-slate-400">
              {t("superintendent.riskNote")}
            </p>
          </Panel>
          <Panel
            title={t("superintendent.vesselPosition")}
            to="/navigation"
            className="min-h-0"
          >
            <div className="relative isolate superintendent-chart">
              <MapContainer
                center={[latitude, longitude]}
                zoom={7}
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapFocus />
                <VietnameseLabels />
                <Polyline
                  positions={sampleVesselTrack}
                  pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.9 }}
                />
                <Marker
                  position={[latitude, longitude]}
                  icon={vesselIcon}
                  zIndexOffset={1000}
                >
                  <Popup>
                    {vesselName}
                    <br />
                    {latitude.toFixed(5)}°, {longitude.toFixed(5)}°
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-200 border-t border-gray-200 py-3 text-center text-xs">
              <div>
                <p className="mb-1 text-[10px] text-slate-400">
                  {t("superintendent.latitude")}
                </p>
                {latitude.toFixed(4)}°
              </div>
              <div>
                <p className="mb-1 text-[10px] text-slate-400">
                  {t("superintendent.longitude")}
                </p>
                {longitude.toFixed(4)}°
              </div>
              <div>
                <p className="mb-1 text-[10px] text-slate-400">SOG</p>
                {"12.4"} kn
              </div>
            </div>
          </Panel>
          <Panel
            title={t("superintendent.workRest")}
            to="/logbooks/watchkeeping"
            className="min-h-0"
          >
            <p className="px-3 pt-3 text-[10px] leading-4 text-slate-400">
              {t("superintendent.workRestNote")}
            </p>
            <div className="superintendent-chart pr-3 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={sampleWorkRest}
                  margin={{ left: -22, right: -14 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="hours" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    unit="%"
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar
                    isAnimationActive={false}
                    yAxisId="hours"
                    dataKey="hours"
                    name={t("superintendent.hoursWorked")}
                    fill="#93c5fd"
                    maxBarSize={17}
                  />
                  <Line
                    isAnimationActive={false}
                    yAxisId="rate"
                    type="monotone"
                    dataKey="violations"
                    name={t("superintendent.violations")}
                    stroke="#ef4444"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>
      {activities && (
        <AppModal title={activities.title} onClose={() => setActivities(null)}>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-blue-50">
                <tr>
                  {["activity", "status", "detail"].map((key) => (
                    <th
                      key={key}
                      className="border-b border-r border-gray-300 px-4 py-3 text-left font-semibold"
                    >
                      {t(`superintendent.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.rows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-200 even:bg-gray-50"
                  >
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3 text-slate-500">{row.detail}</td>
                  </tr>
                ))}
                {!activities.rows.length && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-400">
                      {t("superintendent.noRecords")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AppModal>
      )}
    </div>
  );
}

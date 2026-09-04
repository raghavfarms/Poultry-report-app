import { useRef, useState } from "react";
import { displayDate, formatMinutes, today } from "../utils/date.js";
import { useAuth } from "../context/AuthContext.jsx";

const value = (number, suffix = "") =>
  number == null
    ? "—"
    : `${Number(number).toFixed(Number(number) % 1 ? 2 : 0)}${suffix}`;

function reportAssets(report) {
  const map = new Map(
    report.assets.map((item) => [
      String(item._id),
      {
        id: String(item._id),
        label: item.label,
        order: item.order,
        serviceIntervalMinutes: item.serviceIntervalMinutes,
      },
    ]),
  );
  for (const row of report.rows)
    for (const item of row.assetEntries || [])
      if (!map.has(String(item.asset)))
        map.set(String(item.asset), {
          id: String(item.asset),
          label: item.label,
          order: item.order,
        });
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function nextMissingDate(report) {
  return report.rows
    .filter((row) => row.missing)
    .map((row) => row.date)
    .sort()[0];
}

function currentService(report, assetId) {
  for (const row of report.rows) {
    const item = (row.assetEntries || []).find(
      (entry) => String(entry.asset) === assetId,
    );
    if (item?.service) return item.service;
  }
  return { runningMinutes: 0, due: false };
}

const sum = (items, getValue) =>
  items.reduce((total, item) => total + Number(getValue(item) || 0), 0);

function isAverageOutlier(average, referenceAverage) {
  if (
    average == null ||
    average === "" ||
    referenceAverage == null ||
    referenceAverage === ""
  )
    return false;
  const current = Number(average);
  const reference = Number(referenceAverage);
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(reference) ||
    reference <= 0
  )
    return false;
  const percentageDifference =
    (Math.abs(current - reference) / reference) * 100;
  return Math.round(percentageDifference) > 10;
}

function averageComparison(average, referenceAverage) {
  if (!isAverageOutlier(average, referenceAverage)) return null;
  const actual = Number(average);
  const reference = Number(referenceAverage);
  const difference = actual - reference;
  const percentage = (Math.abs(difference) / reference) * 100;
  const direction = difference > 0 ? "Increase" : "Decrease";
  const sign = difference > 0 ? "+" : "-";

  return `Actual: ${actual.toFixed(2)} L/h · ${direction}: ${sign}${Math.abs(difference).toFixed(2)} L/h (${sign}${Math.round(percentage)}%) · Reference: ${reference.toFixed(2)} L/h`;
}

function reportTotals(report, assets) {
  const rows = report.rows.filter((row) => !row.missing);
  return {
    openingLiters: report.summary.openingLiters,
    dieselInLiters: sum(rows, (row) => row.dieselInLiters),
    lightConsumptionMinutes: sum(rows, (row) => row.lightConsumptionMinutes),
    electricityConsumptionMinutes: sum(
      rows,
      (row) => row.electricityConsumptionMinutes,
    ),
    dieselConsumptionLiters: sum(rows, (row) => row.dieselConsumptionLiters),
    closingLiters: report.summary.closingLiters,
    assets: new Map(
      assets.map((asset) => {
        const entries = rows
          .flatMap((row) => row.assetEntries || [])
          .filter((entry) => String(entry.asset) === asset.id);
        const runningMinutes = sum(entries, (entry) => entry.runningMinutes);
        const refillLiters = sum(entries, (entry) => entry.refillLiters);
        const completedCycles = entries.filter(
          (entry) =>
            Number(entry.cycleMinutes) > 0 && Number(entry.cycleLiters) > 0,
        );
        const completedCycleMinutes = sum(
          completedCycles,
          (entry) => entry.cycleMinutes,
        );
        const completedCycleLiters = sum(
          completedCycles,
          (entry) => entry.cycleLiters,
        );
        return [
          asset.id,
          {
            runningMinutes,
            refillLiters,
            averageLitersPerHour: completedCycleMinutes
              ? completedCycleLiters / (completedCycleMinutes / 60)
              : null,
            fullCount: entries.filter((entry) => entry.isFull).length,
          },
        ];
      }),
    ),
  };
}

export default function ReportView({
  report,
  index,
  controls,
  onEdit,
  onServiceReset,
}) {
  const { user } = useAuth();
  const scrollRef = useRef(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const [dragging, setDragging] = useState(false);
  const isAdmin = ["admin", "developer"].includes(user.role);
  const assets = reportAssets(report);
  const nextDate = nextMissingDate(report);
  const totals = reportTotals(report, assets);
  const startDrag = (event) => {
    if (
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      event.target.closest("button, a, input, select, textarea")
    )
      return;
    drag.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event) => {
    if (!drag.current.active) return;
    event.currentTarget.scrollLeft =
      drag.current.scrollLeft - (event.clientX - drag.current.startX);
  };
  const stopDrag = (event) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };
  return (
    <section className="space-y-1.5 sm:space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-1.5 sm:gap-2">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-700 sm:text-[10px]">
            {index + 1}. Firm
          </p>
          <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-900 sm:text-lg">
            {report.firm.name}
          </h3>
        </div>
        {controls}
        <p className="text-[10px] text-slate-500 sm:text-xs">
          {report.from} → {report.to}
        </p>
      </div>
      <div
        ref={scrollRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className={`report-scroll drag-scroll w-full overflow-x-auto rounded-2xl shadow-sm ${dragging ? "is-dragging" : ""}`}
      >
        <table className="report-table">
          <thead>
            <tr>
              <th rowSpan="2">Date</th>
              <th colSpan="2">Stock</th>
              {assets.map((asset) => (
                <AssetHeader
                  key={asset.id}
                  asset={asset}
                  service={currentService(report, asset.id)}
                  onReset={() => onServiceReset(asset)}
                />
              ))}
              <th colSpan="4">Daily summary</th>
              <th rowSpan="2" className="sticky-action">
                Action
              </th>
            </tr>
            <tr>
              <th>Opening</th>
              <th>IN</th>
              {assets.map((asset) => (
                <FragmentHeader key={asset.id} />
              ))}
              <th>Light</th>
              <th>Electricity</th>
              <th>Diesel</th>
              <th>Closing</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.date} className={row.missing ? "missing" : ""}>
                <td>
                  <b>{displayDate(row.date)}</b>
                </td>
                <td>
                  {!row.missing || row.date === nextDate
                    ? value(row.openingLiters)
                    : "—"}
                </td>
                <td>{row.missing ? "—" : value(row.dieselInLiters)}</td>
                {assets.map((asset) => {
                  const item = row.assetEntries.find(
                    (entry) => String(entry.asset) === asset.id,
                  );
                  return (
                    <AssetCells
                      key={asset.id}
                      item={item}
                      referenceAverage={
                        totals.assets.get(asset.id)?.averageLitersPerHour
                      }
                    />
                  );
                })}
                <td>{formatMinutes(row.lightConsumptionMinutes)}</td>
                <td>{formatMinutes(row.electricityConsumptionMinutes)}</td>
                <td>
                  <b>
                    {row.missing ? "—" : value(row.dieselConsumptionLiters)}
                  </b>
                </td>
                <td>
                  <b>
                    {!row.missing || row.date === nextDate
                      ? value(row.closingLiters)
                      : "—"}
                  </b>
                </td>
                <td className="sticky-action">
                  {(row.missing && row.date === nextDate) ||
                  (!row.missing && (isAdmin || row.date === today())) ? (
                    <button
                      onClick={() => onEdit(row)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-emerald-800"
                    >
                      {row.missing ? "Add" : "Edit"}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <b>Total</b>
              </td>
              <td>{value(totals.openingLiters)}</td>
              <td>{value(totals.dieselInLiters)}</td>
              {assets.map((asset) => (
                <AssetTotalCells
                  key={asset.id}
                  totals={totals.assets.get(asset.id)}
                />
              ))}
              <td>{formatMinutes(totals.lightConsumptionMinutes)}</td>
              <td>{formatMinutes(totals.electricityConsumptionMinutes)}</td>
              <td>
                <b>{value(totals.dieselConsumptionLiters)}</b>
              </td>
              <td>
                <b>{value(totals.closingLiters)}</b>
              </td>
              <td className="sticky-action">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function FragmentHeader() {
  return (
    <>
      <th>Running</th>
      <th>Refill</th>
      <th>Avg</th>
      <th>Full</th>
    </>
  );
}
const serviceTime = (minutes) =>
  `${Math.floor(Number(minutes || 0) / 60)}:${String(Number(minutes || 0) % 60).padStart(2, "0")}`;
function AssetHeader({ asset, service, onReset }) {
  const status = (
    <>
      {serviceTime(service.runningMinutes)} /{" "}
      {serviceTime(asset.serviceIntervalMinutes)} · Last:{" "}
      {service.lastServiceDate || "Never"}
    </>
  );
  return (
    <th colSpan="4">
      <span className="block">{asset.label}</span>
      {service.due ? (
        <button
          type="button"
          onClick={onReset}
          title="Mark service completed today"
          className="text-[9px] font-black text-red-600 underline"
        >
          {status}
          <span className="block">SERVICE DUE · RESET</span>
        </button>
      ) : (
        <span className="block text-[9px] font-semibold text-slate-500">
          {status}
        </span>
      )}
    </th>
  );
}
function AssetCells({ item, referenceAverage }) {
  const comparison = item
    ? averageComparison(item.averageLitersPerHour, referenceAverage)
    : null;
  return (
    <>
      {item ? (
        <>
          <td>{formatMinutes(item.runningMinutes)}</td>
          <td>{value(item.refillLiters)}</td>
          <td
            className={
              comparison ? "cursor-help bg-red-100 font-black text-red-700" : ""
            }
            title={comparison || undefined}
          >
            {value(item.averageLitersPerHour)}
          </td>
          <td className="text-center">{item.isFull ? "✓" : "—"}</td>
        </>
      ) : (
        <>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
        </>
      )}
    </>
  );
}
function AssetTotalCells({ totals }) {
  return (
    <>
      <td>{formatMinutes(totals.runningMinutes)}</td>
      <td>{value(totals.refillLiters)}</td>
      <td>{value(totals.averageLitersPerHour)}</td>
      <td className="text-center">{totals.fullCount}</td>
    </>
  );
}

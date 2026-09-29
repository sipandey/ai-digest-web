"use client";

import { TIMEZONES, fmtRawOffset } from "@/lib/timezones";
import { formatHour } from "./types";

export default function SchedulePillar({
  deliveryActive,
  setDeliveryActive,
  digestHour,
  setDigestHour,
  timezoneOffset,
  setTimezoneOffset,
}: {
  deliveryActive: boolean;
  setDeliveryActive: (a: boolean) => void;
  digestHour: number;
  setDigestHour: (h: number) => void;
  timezoneOffset: number;
  setTimezoneOffset: (tz: number) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Vacation Mode / Active Delivery Toggle */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#14141e]">Automated Daily Delivery</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {deliveryActive
                ? "Active — Daily digests will run automatically at your scheduled hour."
                : "Paused (Vacation Mode) — Automated runs are suspended. You can still trigger digests on demand."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeliveryActive(!deliveryActive)}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              deliveryActive ? "bg-indigo-600" : "bg-gray-300"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                deliveryActive ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Delivery Time & Timezone */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-[#14141e]">Delivery Timing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Delivery hour
            </label>
            <select
              value={digestHour}
              onChange={(e) => setDigestHour(Number(e.target.value))}
              className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] focus:outline-none transition-colors"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Timezone
            </label>
            <select
              value={timezoneOffset}
              onChange={(e) => setTimezoneOffset(Number(e.target.value))}
              className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] focus:outline-none transition-colors"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.offset} value={tz.offset}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Delivery confirmation badge */}
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-500 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-indigo-700">
            Scheduled delivery at{" "}
            <span className="font-semibold">{formatHour(digestHour)}</span>
            {" "}
            <span className="text-indigo-500">({fmtRawOffset(timezoneOffset)})</span>
            {" "}each morning.
          </p>
        </div>
      </div>
    </div>
  );
}

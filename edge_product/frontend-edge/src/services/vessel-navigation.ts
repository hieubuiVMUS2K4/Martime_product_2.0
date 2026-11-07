import { apiClient } from "./api.client";
import type { GpsPoint } from "@/components/ship-data/VesselMap";

export async function fetchVesselNavigation(hours = 24) {
  const [currentPosition, history] = await Promise.all([
    apiClient.get<GpsPoint>("/telemetry/position/latest"),
    apiClient.get<{ data: GpsPoint[] }>("/telemetry/position/history", {
      params: { hours, pageSize: 500 },
    }),
  ]);
  const route = [...(history.data || [])].sort(
    (a, b) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || ""),
  );
  return { currentPosition, route };
}

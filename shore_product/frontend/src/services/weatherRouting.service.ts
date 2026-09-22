import { API_CONFIG } from '@/config/app.config';
import { buildAuthHeaders } from './api.client';
import type {
  CreateWeatherRoutingJobRequest,
  HazardZoneSetDto,
  PortOptionDto,
  ReplanWeatherRoutingJobRequest,
  VesselOptionDto,
  WeatherRoutingJobDto,
  WeatherRoutingJobListItemDto,
} from '../types/weatherRouting.types';

const BASE = '/weather-routing';
/** Pacific A* can exceed the default 30s API timeout. */
const WR_TIMEOUT_MS = 120000;

async function wrFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WR_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const data = await response.json();
        if (data?.message) msg = data.message;
        else if (data?.title) msg = data.title;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timeout');
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const weatherRoutingApi = {
  createJob(body: CreateWeatherRoutingJobRequest = {}): Promise<WeatherRoutingJobDto> {
    return wrFetch<WeatherRoutingJobDto>(`${BASE}/jobs`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  getJob(id: string): Promise<WeatherRoutingJobDto> {
    return wrFetch<WeatherRoutingJobDto>(`${BASE}/jobs/${id}`);
  },

  listJobs(take = 50): Promise<WeatherRoutingJobListItemDto[]> {
    return wrFetch<WeatherRoutingJobListItemDto[]>(`${BASE}/jobs?take=${take}`);
  },

  replan(id: string, body: ReplanWeatherRoutingJobRequest = {}): Promise<WeatherRoutingJobDto> {
    return wrFetch<WeatherRoutingJobDto>(`${BASE}/jobs/${id}/replan`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /** Sinh tập vùng thiên tai demo quanh hành trình (dùng khi chưa có dữ liệu thiên tai thật). */
  getHazards(params: {
    startLat: number;
    startLon: number;
    goalLat: number;
    goalLon: number;
    seed?: number;
    count?: number;
  }): Promise<HazardZoneSetDto> {
    const q = new URLSearchParams({
      startLat: String(params.startLat),
      startLon: String(params.startLon),
      goalLat: String(params.goalLat),
      goalLon: String(params.goalLon),
      count: String(params.count ?? 8),
      ...(params.seed != null ? { seed: String(params.seed) } : {}),
    });
    return wrFetch<HazardZoneSetDto>(`${BASE}/hazards?${q.toString()}`);
  },

  /** Danh sách tàu kèm hồ sơ nhiên liệu (sức chứa, tấn/NM, tấn/ngày, SFOC, tầm hoạt động...). */
  listVessels(): Promise<VesselOptionDto[]> {
    return wrFetch<VesselOptionDto[]>(`${BASE}/vessels`);
  },

  /** Danh sách cảng có toạ độ — dùng cho chọn cảng đi / cảng đến / cảng bắt buộc ghé. */
  listPorts(): Promise<PortOptionDto[]> {
    return wrFetch<PortOptionDto[]>(`${BASE}/ports`);
  },
};

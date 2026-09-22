export interface LatLonDto {
  lat: number;
  lon: number;
}

/** Một vùng thiên tai trên biển (tâm + bán kính + loại). */
export interface HazardZoneDto {
  id: string;
  zoneType?: string;
  hazardType: string;
  name: string;
  center: LatLonDto;
  radiusNm: number;
  severity?: string;
  source?: string;
  icon?: string;
  color?: string;
  label?: string;
}

/** Danh mục loại thiên tai để hiển thị chú thích. */
export interface HazardLegendDto {
  hazardType: string;
  label: string;
  icon: string;
  color: string;
  radiusRangeNm?: string;
}

/** Tập vùng thiên tai demo: `seed` phải truyền lại vào job để tuyến né đúng tập vùng này. */
export interface HazardZoneSetDto {
  seed: number;
  count: number;
  zones: HazardZoneDto[];
  legend: HazardLegendDto[];
}

export interface CreateWeatherRoutingJobRequest {
  vesselId?: string | null;
  voyageId?: string | null;
  startLat?: number | null;
  startLon?: number | null;
  goalLat?: number | null;
  goalLon?: number | null;
  gridSize?: number | null;
  mockStormRadiusNm?: number | null;

  // Lập kế hoạch n chặng (bunkering plan)
  planLegs?: boolean | null;
  currentFuelTons?: number | null;
  fuelCapacityTons?: number | null;
  reserveFraction?: number | null;
  serviceSpeedKts?: number | null;
  servicePowerKw?: number | null;
  maxDetourNm?: number | null;
  portCodes?: string[] | null;
  /** Cảng BẮT BUỘC phải ghé (nhập hàng/thủ tục). */
  mustVisitPortCodes?: string[] | null;
  /** auto | eastbound | westbound | custom */
  routePreference?: string | null;
  corridorViaPortCodes?: string[] | null;
  departureUtc?: string | null;

  // Thiên tai
  hazardSeed?: number | null;
  hazardCount?: number | null;
}

export interface VoyageLegDto {
  sequence: number;
  fromPortCode?: string | null;
  fromPortName?: string | null;
  toPortCode?: string | null;
  toPortName?: string | null;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  distanceNm: number;
  durationHours: number;
  averageSpeedKts: number;
  departureUtc: string;
  arrivalUtc: string;
  fuelOnDepartureTons: number;
  fuelConsumedTons: number;
  fuelOnArrivalTons: number;
  fuelOnArrivalPercent: number;
  bunkerTons: number;
  isBunkerStop: boolean;
  /** Vai trò cảng đến: START | BUNKER | MANDATORY | END. */
  stopKind?: string | null;
  portOffsetNm: number;
  waypoints?: LatLonDto[];
  notes?: string | null;
}

export interface VoyageLegPlanDto {
  voyageId?: string | null;
  vesselId?: string | null;
  totalDistanceNm: number;
  totalFuelTons: number;
  totalHours: number;
  legCount: number;
  bunkerStopCount: number;
  initialFuelTons: number;
  finalFuelTons: number;
  fuelCapacityTons: number;
  reserveTons: number;
  reserveFraction: number;
  tonsPerNm: number;
  tonsPerDay: number;
  serviceSpeedKts: number;
  rangeAtDepartureNm: number;
  departureUtc: string;
  arrivalUtc: string;
  model: string;
  corridorSource?: string | null;
  warnings: string[];
  legs: VoyageLegDto[];
  fuelProfile?: unknown;
}

export interface ReplanWeatherRoutingJobRequest {
  gridSize?: number | null;
  mockStormRadiusNm?: number | null;
}

/** Thông số kỹ thuật (hồ sơ đăng kiểm) của tàu — GET /api/weather-routing/vessels */
export interface VesselSpecsDto {
  vesselType?: string | null;
  flag?: string | null;
  yearBuilt?: number | null;
  callSign?: string | null;
  deadWeight?: number | null;
  grossTonnage?: number | null;
  serviceSpeedKts?: number | null;
  mainEnginePowerKw?: number | null;
  fuelCapacityTons?: number | null;
  fuelConsumptionTonsPerDay?: number | null;
  cruisingRangeNm?: number | null;
  draftMoulded?: number | null;
  depthMoulded?: number | null;
  noOfCargoHolds?: number | null;
  classSocietyName?: string | null;
}

/** Hồ sơ nhiên liệu dùng cho tính toán chi phí chặng. */
export interface VesselFuelProfileDto {
  id: string;
  fuelType?: string | null;
  source?: string | null;
  notes?: string | null;
  fuelCapacityTons: number;
  currentFuelTons?: number | null;
  reserveFraction: number;
  serviceSpeedKts: number;
  servicePowerKw: number;
  sfocMainGPerKwh: number;
  sfocAuxGPerKwh: number;
  auxLoadKw: number;
  seaMarginFraction: number;
  weatherAllowanceFraction: number;
  portStayHours: number;
  maxDetourNm?: number | null;
  /** Suy ra từ model: tấn/ngày, tấn/NM, tầm hoạt động, dự trữ tối thiểu. */
  tonsPerDay?: number | null;
  tonsPerNm?: number | null;
  rangeNm?: number | null;
  reserveTons?: number | null;
  bunkerPortsPerTank?: number | null;
}

export interface VesselOptionDto {
  id: string;
  name: string;
  imo?: string | null;
  callSign?: string | null;
  hasProfile: boolean;
  /** Có thể vắng nếu backend chưa build bản mới. */
  specs?: VesselSpecsDto;
  profile?: VesselFuelProfileDto | null;
}

/** Cảng có toạ độ — GET /api/weather-routing/ports */
export interface PortOptionDto {
  code: string;
  name: string;
  country?: string | null;
  lat: number;
  lon: number;
}

export interface WeatherRoutingRouteDto {
  id: string;
  jobId: string;
  kind: string;
  version: number;
  waypoints: LatLonDto[];
  metrics?: unknown;
  createdAt: string;
}

export interface WeatherRoutingJobDto {
  id: string;
  vesselId?: string | null;
  startLat: number;
  startLon: number;
  goalLat: number;
  goalLon: number;
  status: string;
  version: number;
  request?: unknown;
  hazards?: unknown;
  metrics?: unknown;
  plan?: VoyageLegPlanDto | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  routes: WeatherRoutingRouteDto[];
}

export interface WeatherRoutingJobListItemDto {
  id: string;
  vesselId?: string | null;
  startLat: number;
  startLon: number;
  goalLat: number;
  goalLon: number;
  status: string;
  version: number;
  createdAt: string;
  completedAt?: string | null;
}

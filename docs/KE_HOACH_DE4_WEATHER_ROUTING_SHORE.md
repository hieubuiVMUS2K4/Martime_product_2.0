# Kế hoạch Đề 4 — Weather Routing (Shore A*)

> Scope: **chỉ** `shore_product` Weather Routing. Không đụng Edge, sync, module Shore khác, không tắt Docker.

## Quyết định đã chốt
- UI: trang riêng `/weather-routing`, menu **Tối ưu tuyến**
- Hazard phase 1: **mock** (không dùng GDACS cho routing)
- Map tiles: **OSM mặc định** (không đổi tile các map khác)
- Demo voyage: Vũng Tàu (`VNVUT`) → Panama Canal Colón (`PAPCN`)
- Vessel: MEKONG `03510b57-38d8-45a6-8bbc-78e626357620`, IMO `1222112`
- Voyage seed id: `a1111111-de40-4000-8000-000000000001` (`DE4-VT-PA-001`)
- Distance limit đủ VN→Panama (~12000 nm)

## Phase 0 — DB
- Dùng Postgres Shore đang chạy (`:5434`). Không `docker stop`.
- Tables: `weather_routing_jobs`, `weather_routing_routes` (EF migration).
- Kiểm MEKONG + position_data + voyage demo.

## Phase 1 — Core A*
- GridBuilder, A* tránh hazard mock, StraightBaseline.
- Entities/DTOs, sync job runner.
- API: `POST/GET /api/weather-routing/jobs`.
- Unit tests đường tránh block.

## Phase 2 — UI
- `WeatherRoutingPage` + types + service.
- Route + TopNav link (chỉ thêm mục Tối ưu tuyến; không redesign nav).
- VesselMap: optional `optimizedRoute` / `baselineRoute` / `hazards` (default OSM). Không đổi hành vi map trang khác.

## Phase 3 — Replan
- `POST .../replan`, version++, nút cập nhật thời tiết trên UI.

## Phase 4 — Real data
- `vesselId` → latest `position_data` (OriginNode chứa IMO).
- `voyageId` → port lat/lon (`ArrivalPortCode`).
- Seed SQL + `docs/DE4_WEATHER_ROUTING_DEMO.md`.

## Phase 5 — Harden
- Validation (NaN, distance, storm radius), 400 on resolve errors.
- List `take` clamp, A* metrics log, Authorize nếu pattern sẵn có.
- Pacific eastbound lon unwrap nếu cần VN→Panama.

## Out of scope
- Edge product, sync queue, SMS, crew, GDACS routing, đổi theme/nav tổng thể, tắt/restart toàn stack Docker.

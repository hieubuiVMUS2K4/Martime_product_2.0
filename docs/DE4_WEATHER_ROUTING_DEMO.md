# DE4 Weather Routing — Demo

## Chạy
Shore Docker: postgres `:5434`, backend `:5000`, frontend `:3000`.
Login: `admin` / `Admin@123`

## UI
Mở http://localhost:3000/weather-routing (menu **Tối ưu tuyến**).
Nút **Nạp MEKONG (Vũng Tàu → Đà Nẵng)** rồi chạy. Map: baseline xám, A* xanh, storm mock đỏ (Cam Ranh).

## API
POST `/api/weather-routing/jobs` (Bearer token)
GET `/api/weather-routing/jobs/{id}`
POST `/api/weather-routing/jobs/{id}/replan`

Demo body:
```json
{"startLat":10.346,"startLon":107.084,"goalLat":16.054,"goalLon":108.202,"gridSize":80,"mockStormRadiusNm":40}
```

## Smoke (2026-09-22)
POST job → status=completed, 2 routes (astar ~48 pts, baseline ~48 pts), elapsed ~48ms.

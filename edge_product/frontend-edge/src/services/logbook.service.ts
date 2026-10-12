import { apiClient } from './api.client';
import { 
  PaginatedLogbookResponse, 
  LogbookPaginationDto,
  CreateDeckLogEntryDto,
  DeckLogEntryResponseDto,
  CreateEngineLogEntryDto,
  EngineLogEntryResponseDto,
  CreateOilRecordEntryDto,
  OilRecordEntryResponseDto,
  CreateWatchkeepingLogDto,
  WatchkeepingLogResponseDto,
  CreateGarbageRecordDto,
  GarbageRecordResponseDto,
  CreateGarbagePartIDto,
  GarbagePartIResponseDto,
  CreateGarbagePartIIDto,
  GarbagePartIIResponseDto,
  CreateBallastWaterRecordDto,
  BallastWaterRecordResponseDto,
  SignLogbookDto,
  CreateVoyageLogEntryDto,
  VoyageLogEntryResponseDto,
  VoyageLogQueryDto,
  VoyageLogTimelineItem,
  VoyageLogEventInfo,
  SignVoyageLogEntryDto
} from '../types/logbook.types';

class LogbookService {
  private buildQueryString(params: any) {
    const query = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        query.append(key, params[key].toString());
      }
    });
    return query.toString();
  }

  // Deck Log
  async getDeckEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<DeckLogEntryResponseDto>>(`/logbooks/deck?${queryString}`);
  }

  async createDeckEntry(data: CreateDeckLogEntryDto) {
    return await apiClient.post<DeckLogEntryResponseDto>('/logbooks/deck', data);
  }

  async updateDeckEntry(id: string, data: CreateDeckLogEntryDto) {
    return await apiClient.put<DeckLogEntryResponseDto>(`/logbooks/deck/${id}`, data);
  }

  async signDeckEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/deck/${id}/sign`, {
      });
  }

  // Engine Log
  async getEngineEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<EngineLogEntryResponseDto>>(`/logbooks/engine?${queryString}`);
  }

  async createEngineEntry(data: CreateEngineLogEntryDto) {
    return await apiClient.post<EngineLogEntryResponseDto>('/logbooks/engine', data);
  }

  async updateEngineEntry(id: string, data: CreateEngineLogEntryDto) {
    return await apiClient.put<EngineLogEntryResponseDto>(`/logbooks/engine/${id}`, data);
  }

  async signEngineEntry(id: string, data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/engine/${id}/sign`, {
      chiefEngineerRemarks: data.remarks,
      });
  }

  // Oil Record
  async getOilEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<OilRecordEntryResponseDto>>(`/logbooks/oil?${queryString}`);
  }

  async createOilEntry(data: CreateOilRecordEntryDto) {
    return await apiClient.post<OilRecordEntryResponseDto>('/logbooks/oil', data);
  }

  async updateOilEntry(id: string, data: CreateOilRecordEntryDto) {
    return await apiClient.put<OilRecordEntryResponseDto>(`/logbooks/oil/${id}`, data);
  }

  async signOilEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/oil/${id}/sign`, {
      });
  }

  // Watchkeeping Log
  async getWatchkeepingEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<WatchkeepingLogResponseDto>>(`/logbooks/watchkeeping?${queryString}`);
  }

  async createWatchkeepingEntry(data: CreateWatchkeepingLogDto) {
    return await apiClient.post<WatchkeepingLogResponseDto>('/logbooks/watchkeeping', data);
  }

  async updateWatchkeepingEntry(id: string, data: CreateWatchkeepingLogDto) {
    return await apiClient.put<WatchkeepingLogResponseDto>(`/logbooks/watchkeeping/${id}`, data);
  }

  async signWatchkeepingEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/watchkeeping/${id}/sign`, {
      });
  }

  // Garbage Record
  async getGarbageEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<GarbageRecordResponseDto>>(`/logbooks/garbage?${queryString}`);
  }

  async createGarbageEntry(data: CreateGarbageRecordDto) {
    return await apiClient.post<GarbageRecordResponseDto>('/logbooks/garbage', data);
  }

  async updateGarbageEntry(id: string, data: CreateGarbageRecordDto) {
    return await apiClient.put<GarbageRecordResponseDto>(`/logbooks/garbage/${id}`, data);
  }

  async signGarbageEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/garbage/${id}/sign`, {
      });
  }

  // Garbage Record Part I
  async getGarbagePartIEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<GarbagePartIResponseDto>>(`/logbooks/garbage/part-i?${queryString}`);
  }

  async createGarbagePartIEntry(data: CreateGarbagePartIDto) {
    return await apiClient.post<GarbagePartIResponseDto>('/logbooks/garbage/part-i', data);
  }

  async updateGarbagePartIEntry(id: string, data: CreateGarbagePartIDto) {
    return await apiClient.put<GarbagePartIResponseDto>(`/logbooks/garbage/part-i/${id}`, data);
  }

  async deleteGarbagePartIEntry(id: string) {
    return await apiClient.delete(`/logbooks/garbage/part-i/${id}`);
  }

  async signGarbagePartIEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/garbage/part-i/${id}/sign`, {
      });
  }

  // Garbage Record Part II
  async getGarbagePartIIEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<GarbagePartIIResponseDto>>(`/logbooks/garbage/part-ii?${queryString}`);
  }

  async createGarbagePartIIEntry(data: CreateGarbagePartIIDto) {
    return await apiClient.post<GarbagePartIIResponseDto>('/logbooks/garbage/part-ii', data);
  }

  async updateGarbagePartIIEntry(id: string, data: CreateGarbagePartIIDto) {
    return await apiClient.put<GarbagePartIIResponseDto>(`/logbooks/garbage/part-ii/${id}`, data);
  }

  async deleteGarbagePartIIEntry(id: string) {
    return await apiClient.delete(`/logbooks/garbage/part-ii/${id}`);
  }

  async signGarbagePartIIEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/garbage/part-ii/${id}/sign`, {
      });
  }

  // Ballast Water Record
  async getBallastWaterEntries(params: LogbookPaginationDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<BallastWaterRecordResponseDto>>(`/logbooks/ballast?${queryString}`);
  }

  async createBallastWaterEntry(data: CreateBallastWaterRecordDto) {
    return await apiClient.post<BallastWaterRecordResponseDto>('/logbooks/ballast', data);
  }

  async updateBallastWaterEntry(id: string, data: CreateBallastWaterRecordDto) {
    return await apiClient.put<BallastWaterRecordResponseDto>(`/logbooks/ballast/${id}`, data);
  }

  async signBallastWaterEntry(id: string, _data: SignLogbookDto) {
    return await apiClient.post(`/logbooks/ballast/${id}/sign`, {
      });
  }

  // ==================== VOYAGE LOG ====================
  
  async getVoyageLogEntries(params: VoyageLogQueryDto) {
    const queryString = this.buildQueryString(params);
    return await apiClient.get<PaginatedLogbookResponse<VoyageLogEntryResponseDto>>(`/voyage-log?${queryString}`);
  }

  async getVoyageLogEntry(id: string) {
    return await apiClient.get<VoyageLogEntryResponseDto>(`/voyage-log/${id}`);
  }

  async createVoyageLogEntry(data: CreateVoyageLogEntryDto) {
    return await apiClient.post<VoyageLogEntryResponseDto>('/voyage-log', data);
  }

  async updateVoyageLogEntry(id: string, data: Partial<CreateVoyageLogEntryDto>) {
    return await apiClient.put<VoyageLogEntryResponseDto>(`/voyage-log/${id}`, data);
  }

  async deleteVoyageLogEntry(id: string) {
    return await apiClient.delete(`/voyage-log/${id}`);
  }

  async signVoyageLogEntry(id: string, data: SignVoyageLogEntryDto) {
    return await apiClient.post<VoyageLogEntryResponseDto>(`/voyage-log/${id}/sign`, { remarks: data.remarks });
  }

  async getVoyageLogTimeline(voyageId?: string, limit: number = 50) {
    const params: Record<string, string> = { limit: limit.toString() };
    if (voyageId) params.voyageId = voyageId;
    const queryString = this.buildQueryString(params);
    return await apiClient.get<VoyageLogTimelineItem[]>(`/voyage-log/timeline?${queryString}`);
  }

  async getLastVoyageLogEntry(voyageId?: string) {
    const params = voyageId ? `?voyageId=${voyageId}` : '';
    return await apiClient.get<VoyageLogEntryResponseDto>(`/voyage-log/last${params}`);
  }

  async getVoyageLogEventTypes() {
    return await apiClient.get<VoyageLogEventInfo[]>('/voyage-log/event-types');
  }
}

export const logbookService = new LogbookService();

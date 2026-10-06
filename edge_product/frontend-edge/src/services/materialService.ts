import { apiClient, getAuthToken } from './api.client'
import { API_CONFIG } from '@/config/app.config'
import type { MaterialCategory, MaterialItem } from '@/types/maritime.types'

// Danh mục vật tư của công ty (material_items — đồng bộ từ Shore)
export interface MaterialCatalogItem {
  id: string
  itemCode: string
  name: string
  categoryId: number
  categoryName?: string
  unitPrice?: number | null
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

// ============================================================
// MATERIAL CATEGORY DTOs
// ============================================================

export interface CreateMaterialCategoryDto {
  categoryCode: string
  name: string
  description?: string | null
  parentCategoryId?: number | null
  isActive?: boolean
}

export interface UpdateMaterialCategoryDto {
  categoryCode: string
  name: string
  description?: string | null
  parentCategoryId?: number | null
  isActive?: boolean
}

export interface MaterialCategoryResponseDto extends MaterialCategory {
  parentCategoryName?: string | null
  itemCount?: number
  subCategoryCount?: number
}

// ============================================================
// MATERIAL ITEM DTOs
// ============================================================

export interface CreateMaterialItemDto {
  itemCode: string
  name: string
  categoryId: number
  specification?: string | null
  unit?: string
  onHandQuantity?: number
  minStock?: number | null
  maxStock?: number | null
  reorderLevel?: number | null
  reorderQuantity?: number | null
  location?: string | null
  manufacturer?: string | null
  supplier?: string | null
  partNumber?: string | null
  barcode?: string | null
  batchTracked?: boolean
  serialTracked?: boolean
  expiryRequired?: boolean
  unitCost?: number | null
  currency?: string | null
  notes?: string | null
  isActive?: boolean
}

export interface UpdateMaterialItemDto {
  itemCode: string
  name: string
  categoryId: number
  specification?: string | null
  unit?: string
  onHandQuantity?: number
  minStock?: number | null
  maxStock?: number | null
  reorderLevel?: number | null
  reorderQuantity?: number | null
  location?: string | null
  manufacturer?: string | null
  supplier?: string | null
  partNumber?: string | null
  barcode?: string | null
  batchTracked?: boolean
  serialTracked?: boolean
  expiryRequired?: boolean
  unitCost?: number | null
  currency?: string | null
  notes?: string | null
  isActive?: boolean
}

export interface MaterialItemResponseDto extends MaterialItem {
  categoryName?: string
  categoryCode?: string
  isLowStock?: boolean
  totalValue?: number | null
  stockStatus?: 'Low' | 'OK' | 'Over'
}

export interface StockAdjustmentDto {
  itemId: string; // Guid
  quantity: number
  adjustmentType: 'Add' | 'Subtract' | 'Set'
  reason?: string | null
}

// ============================================================
// EQUIPMENT ASSIGNMENT DTOs
// ============================================================

export interface AssignEquipmentDto {
  materialItemIds: string[]
  equipmentAssetIds: string[]
  quantityRequired?: number
  notes?: string | null
}

export interface MaterialItemEquipmentLink {
  id: string
  materialItemId: string
  equipmentAssetId: string
  notes?: string | null
  createdAt: string
  equipmentCode?: string
  equipmentName?: string
  equipmentCategory?: string
}

export interface EquipmentMaterialLink {
  equipmentAssetId?: string
  linkId: string
  materialItemId: string
  itemCode: string
  name: string
  unit: string
  onHandQuantity?: number | null
  quantityRequired: number
  minStock?: number | null
  specification?: string | null
  notes?: string | null
  linkedAt: string
  /** If material was inherited from a parent equipment, this is the parent's ID */
  inheritedFrom?: string | null
}

export interface ItemActivityRequest {
  type: 'request'
  code: string
  date: string
  status: string
  quantity: number
  note?: string | null
  urgency: string
  requestedBy?: string | null
}

export interface ItemActivityReceipt {
  type: 'receipt'
  code: string
  date: string
  status: string
  quantityReceived: number
  quantityRequested: number
  unitCost?: number | null
  currency?: string | null
  supplierName?: string | null
  note?: string | null
}

export interface ItemActivityResponse {
  summary: {
    totalRequested: number
    totalReceived: number
    pendingRequests: number
    lastRequestDate?: string | null
    lastReceiptDate?: string | null
  }
  requests: ItemActivityRequest[]
  receipts: ItemActivityReceipt[]
}

// ============================================================
// MATERIAL SERVICE
// ============================================================

export const materialService = {
  // ======== CATEGORIES ========
  
  getCategories: (onlyActive: boolean = true, parentId?: number) => {
    const params = new URLSearchParams()
    params.append('onlyActive', String(onlyActive))
    if (parentId !== undefined) params.append('parentId', String(parentId))
    return apiClient.get<MaterialCategory[]>(`/material/categories?${params}`)
  },

  getCategoriesDetailed: (onlyActive: boolean = true) => {
    const params = new URLSearchParams()
    params.append('onlyActive', String(onlyActive))
    return apiClient.get<MaterialCategoryResponseDto[]>(`/material/categories/detailed?${params}`)
  },

  getCategoryById: (id: number) =>
    apiClient.get<MaterialCategory>(`/material/categories/${id}`),

  createCategory: (dto: CreateMaterialCategoryDto) =>
    apiClient.post<MaterialCategory>('/material/categories', dto),

  updateCategory: (id: number, dto: UpdateMaterialCategoryDto) =>
    apiClient.put<MaterialCategory>(`/material/categories/${id}`, dto),

  deleteCategory: (id: number) =>
    apiClient.delete<{ message: string; id: number; categoryCode: string; name: string }>(`/material/categories/${id}`),

  getItemsByCategory: (id: number, onlyActive: boolean = true) => {
    const params = new URLSearchParams()
    params.append('onlyActive', String(onlyActive))
    return apiClient.get<MaterialItem[]>(`/material/categories/${id}/items?${params}`)
  },

  getAssignedEquipment: () => apiClient.get<{ materialItemId: string; equipmentAssetId: string; equipmentCode: string; equipmentName: string }[]>('/material/items/assigned-equipment'),

  // ======== ITEMS ========

  getItems: (options?: { categoryId?: number; q?: string; onlyActive?: boolean }) => {
    const params = new URLSearchParams()
    if (options?.categoryId) params.append('categoryId', String(options.categoryId))
    if (options?.q) params.append('q', options.q)
    if (options?.onlyActive !== undefined) params.append('onlyActive', String(options.onlyActive))
    return apiClient.get<MaterialItem[]>(`/material/items?${params}`)
  },

  // DANH MỤC vật tư của công ty (material_items, đồng bộ từ Shore) — chỉ đọc.
  getCatalog: (options?: { categoryId?: number; q?: string }) => {
    const params = new URLSearchParams()
    if (options?.categoryId) params.append('categoryId', String(options.categoryId))
    if (options?.q) params.append('q', options.q)
    return apiClient.get<MaterialCatalogItem[]>(`/material/catalog?${params}`)
  },

  getItemsDetailed: (options?: { categoryId?: number; q?: string; onlyActive?: boolean }) => {
    const params = new URLSearchParams()
    if (options?.categoryId) params.append('categoryId', String(options.categoryId))
    if (options?.q) params.append('q', options.q)
    if (options?.onlyActive !== undefined) params.append('onlyActive', String(options.onlyActive))
    return apiClient.get<MaterialItemResponseDto[]>(`/material/items/detailed?${params}`)
  },

  getLowStockItems: () =>
    apiClient.get<MaterialItem[]>('/material/items/low-stock'),

  getItemById: (id: string) =>
    apiClient.get<MaterialItem>(`/material/items/${id}`),

  createItem: (dto: CreateMaterialItemDto) =>
    apiClient.post<MaterialItem>('/material/items', dto),

  updateItem: (id: string, dto: UpdateMaterialItemDto) =>
    apiClient.put<MaterialItem>(`/material/items/${id}`, dto),

  deleteItem: (id: string) =>
    apiClient.delete<{ message: string; id: string; itemCode: string; name: string }>(`/material/items/${id}`),

  adjustStock: (dto: StockAdjustmentDto) =>
    apiClient.post<{
      message: string
      itemId: string // Guid
      itemCode: string
      oldQuantity: number
      newQuantity: number
      adjustmentType: string
      quantity: number
      reason?: string
    }>('/material/items/adjust-stock', dto),

  // ── Equipment Assignment ──
  getEquipmentCounts: () =>
    apiClient.get<{ materialItemId: string; count: number }[]>('/material/items/equipment-counts'),

  getItemEquipment: (itemId: string) =>
    apiClient.get<MaterialItemEquipmentLink[]>(`/material/items/${itemId}/equipment`),

  getMaterialsByEquipment: (equipmentAssetId: string) =>
    apiClient.get<EquipmentMaterialLink[]>(`/material/items/by-equipment/${equipmentAssetId}`),

  assignEquipment: (dto: AssignEquipmentDto) =>
    apiClient.post<{ message: string; created: number; skipped: number }>(
      '/material/items/assign-equipment',
      dto,
    ),

  updateEquipmentLink: (materialItemId: string, equipmentAssetId: string, dto: { quantityRequired: number; notes?: string | null }) =>
    apiClient.put<{ message: string }>(
      `/material/items/${materialItemId}/equipment/${equipmentAssetId}`,
      dto,
    ),

  removeEquipmentLink: (materialItemId: string, equipmentAssetId: string) =>
    apiClient.delete<{ message: string }>(
      `/material/items/${materialItemId}/equipment/${equipmentAssetId}`,
    ),

  // ── Image Upload ──
  uploadItemImage: async (itemId: string, file: File): Promise<{ imageUrl: string }> => {
    const fd = new FormData()
    fd.append('file', file)
    const headers: Record<string, string> = {}
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_CONFIG.BASE_URL}/material/items/${itemId}/image`, {
      method: 'PUT',
      body: fd,
      headers,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  },

  deleteItemImage: (itemId: string) =>
    apiClient.delete<{ message: string }>(`/material/items/${itemId}/image`),

  getItemActivity: (itemId: string) =>
    apiClient.get<ItemActivityResponse>(`/material/items/${itemId}/activity`),
}

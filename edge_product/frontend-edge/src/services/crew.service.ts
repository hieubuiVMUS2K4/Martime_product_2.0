/**
 * Crew Service - API calls for crew management
 */

import { apiClient } from './api.client';

export interface CrewMember {
  id: string;
  crewId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  rank: string;
  rankGroup?: string; // "OFFICER", "DECK", "ENGINE", "GALLEY", etc.
  isOnboard: boolean;
  department?: string;
  countryName?: string;
  email?: string;
  phone?: string;
}

/**
 * Get all crew members currently onboard
 */
export async function getOnboardCrew(): Promise<CrewMember[]> {
  const response = await apiClient.get<CrewMember[]>('/crew/onboard');
  return response; // apiClient.get() returns data directly, not wrapped in .data
}

/**
 * Get crew member by ID
 */
export async function getCrewById(id: string): Promise<CrewMember> {
  const response = await apiClient.get<CrewMember>(`/crew/${id}`);
  return response;
}

/**
 * Get all crew members (including offboard)
 */
export async function getAllCrew(): Promise<CrewMember[]> {
  const response = await apiClient.get<CrewMember[]>('/crew');
  return response;
}

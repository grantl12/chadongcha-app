import { apiClient } from './client';

export type CrewMember = {
  id: string;
  username: string;
  level: number;
  xp: number;
};

export type CrewRanking = {
  id: string;
  name: string;
  home_city: string | null;
  team_color: string;
  member_count: number;
  total_xp: number;
};

export type Crew = {
  id: string;
  name: string;
  description: string | null;
  home_city: string | null;
  team_color: string;
  leader_id: string;
  created_at: string;
  members?: CrewMember[];
};

export const crewApi = {
  list: (limit = 20, offset = 0) =>
    apiClient.get(`/crews/?limit=${limit}&offset=${offset}`) as Promise<Crew[]>,

  leaderboard: (limit = 20) =>
    apiClient.get(`/crews/leaderboard?limit=${limit}`) as Promise<CrewRanking[]>,
  
  get: (id: string) => 
    apiClient.get(`/crews/${id}`) as Promise<Crew>,
  
  create: (data: { name: string; description?: string; home_city?: string; team_color?: string }) =>
    apiClient.post('/crews/', data) as Promise<Crew>,
  
  join: (id: string) => 
    apiClient.post(`/crews/${id}/join`, {}) as Promise<{ ok: boolean }>,
  
  leave: () =>
    apiClient.post('/crews/leave', {}) as Promise<{ ok: boolean }>,

  disband: (id: string) =>
    apiClient.delete(`/crews/${id}`) as Promise<{ ok: boolean }>,
};

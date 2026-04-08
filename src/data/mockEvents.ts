import type { UserPrediction, LeaderboardEntry, User, Transaction } from '../types'

export const mockPredictions: UserPrediction[] = []

export const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: 'CarlosGT', correct: 47, total: 58, cobrado: 12400, tier: 3 },
  { rank: 2, name: 'MariaH', correct: 41, total: 52, cobrado: 9800, tier: 2 },
  { rank: 3, name: 'JuanSV', correct: 38, total: 49, cobrado: 8200, tier: 3 },
  { rank: 4, name: 'AndreaPZ', correct: 35, total: 46, cobrado: 7100, tier: 2 },
  { rank: 5, name: 'RobertoMX', correct: 33, total: 44, cobrado: 6500, tier: 2 },
  { rank: 6, name: 'SofiaRC', correct: 31, total: 42, cobrado: 5900, tier: 1 },
  { rank: 7, name: 'DiegoHN', correct: 29, total: 40, cobrado: 5200, tier: 2 },
  { rank: 8, name: 'LucianaGT', correct: 27, total: 38, cobrado: 4800, tier: 1 },
  { rank: 9, name: 'FernandoSV', correct: 25, total: 37, cobrado: 4100, tier: 1 },
  { rank: 10, name: 'ValeriaB', correct: 23, total: 35, cobrado: 3700, tier: 1 },
]

export const mockFriends: LeaderboardEntry[] = [
  { rank: 1, name: 'CarlosGT', correct: 47, total: 58, cobrado: 12400, tier: 3 },
  { rank: 2, name: 'MariaH', correct: 41, total: 52, cobrado: 9800, tier: 2 },
  { rank: 3, name: 'DiegoHN', correct: 29, total: 40, cobrado: 5200, tier: 2 },
]

export const mockTransactions: Transaction[] = [
  { id: 't1', type: 'deposit', amount: 500, label: 'Depósito en efectivo', date: '2026-03-04' },
  { id: 't2', type: 'vote', amount: -50, label: 'Voto: ¿Ganará Comunicaciones el Clausura?', date: '2026-03-03' },
  { id: 't3', type: 'win', amount: 94, label: 'Cobro: Comunicaciones Clausura', date: '2026-03-02' },
  { id: 't4', type: 'vote', amount: -30, label: 'Voto: ¿Subirá el dólar a Q8.10?', date: '2026-03-01' },
  { id: 't5', type: 'loss', amount: -30, label: 'Perdido: Tipo de cambio', date: '2026-02-28' },
  { id: 't6', type: 'deposit', amount: 800, label: 'Depósito en efectivo', date: '2026-02-25' },
  { id: 't7', type: 'vote', amount: -100, label: 'Voto: ¿Aprobará el Congreso reforma?', date: '2026-02-20' },
  { id: 't8', type: 'win', amount: 188, label: 'Cobro: Reforma del Congreso', date: '2026-02-19' },
  { id: 't9', type: 'withdraw', amount: -200, label: 'Retiro en efectivo', date: '2026-02-15' },
]

export const mockUser: User = {
  id: 'u1',
  name: 'Tu',
  balance: 0,
  currency: 'Q',
  tier: 1,
  totalPredictions: 0,
  correctPredictions: 0,
  totalCobrado: 0,
  monthPredictions: 0,
  monthCorrect: 0,
}

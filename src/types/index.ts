export type Category = 'deportes' | 'politica' | 'economia' | 'geopolitica' | 'cultura' | 'tecnologia' | 'finanzas' | 'otro'

export type KycTier = 1 | 2 | 3

export interface Sponsor {
  name: string
  logoUrl?: string
  color?: string
}

export interface Comment {
  id: string
  userId?: string
  username: string
  avatarUrl?: string
  side?: 'yes' | 'no'
  text: string
  timeAgo: string
  tier: KycTier
  likes?: number
  dislikes?: number
  replies?: Comment[]
}

export interface Event {
  id: string
  question: string
  category: Category
  sponsor: Sponsor
  eventType?: 'binary' | 'open'
  yesPercent: number
  noPercent: number
  options?: string[]
  considerations?: string
  poolSize: number
  currency: 'Q' | '$'
  timeRemaining: string
  isLive: boolean
  minEntry: number
  maxEntry: number
  tierRequired: KycTier
  status: 'open' | 'closed' | 'resolved' | 'private'
  result?: 'yes' | 'no'
  subtype?: 'parametrico' | 'reputacion' | 'bono'
  yesTrend?: 'up' | 'down' | 'stable'
  endsAt?: string
  comments?: Comment[]
  createdAt?: string
  imageUrl?: string
  country?: string
}

export interface NewsArticle {
  id: string
  headline: string
  summary: string
  category: string
  source: string
  timeAgo: string
  relatedEventId?: string
  country?: string
  url?: string
  imageUrl?: string
  publishedAt?: string
}

export interface UserPrediction {
  id: string
  eventId: string
  event: Event
  side: string
  amount: number
  potentialCobro: number
  status: 'active' | 'won' | 'lost' | 'sold'
  resolvedAt?: string
  createdAt?: string
}

export interface LeaderboardEntry {
  rank: number
  name: string
  avatar?: string
  correct: number
  total: number
  cobrado: number
  tier: KycTier
}

export interface Transaction {
  id: string
  type: 'deposit' | 'withdraw' | 'vote' | 'win' | 'loss' | 'sell' | 'refund'
  amount: number
  label: string
  date: string
}

export interface User {
  id: string
  name: string
  avatar?: string
  balance: number
  currency: 'Q' | '$'
  tier: KycTier
  totalPredictions: number
  correctPredictions: number
  totalCobrado: number
  monthPredictions?: number
  monthCorrect?: number
}

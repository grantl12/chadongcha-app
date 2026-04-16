/**
 * Market Store — used-car marketplace.
 *
 * Players list caught vehicles for sale; others can bid credits.
 * All API calls route through the FastAPI backend (/market/*).
 */

import { create } from 'zustand';
import { apiClient } from '@/api/client';

export type MarketListing = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  catchId: string;
  make: string;
  model: string;
  generation: string;
  bodyStyle: string;
  color: string;
  rarity: string;
  askingPrice: number;           // credits
  topBid: number;                // highest bid so far (0 if none)
  bidCount: number;
  status: 'active' | 'sold' | 'cancelled';
  listedAt: string;
  expiresAt: string;
};

export type MarketBid = {
  id: string;
  listingId: string;
  bidderId: string;
  amount: number;
  createdAt: string;
};

type MarketStore = {
  listings: MarketListing[];
  myListings: MarketListing[];
  myBids: MarketBid[];
  loading: boolean;
  error: string | null;

  fetchListings: () => Promise<void>;
  fetchMyListings: () => Promise<void>;
  fetchMyBids: () => Promise<void>;
  createListing: (params: {
    catchId: string;
    make: string; model: string; generation: string;
    bodyStyle: string; color: string; rarity: string;
    askingPrice: number;
  }) => Promise<void>;
  placeBid: (listingId: string, amount: number) => Promise<void>;
  acceptBid: (listingId: string, bidId: string) => Promise<void>;
  cancelListing: (listingId: string) => Promise<void>;
  clearError: () => void;
};

export const useMarketStore = create<MarketStore>()((set, get) => ({
  listings:   [],
  myListings: [],
  myBids:     [],
  loading:    false,
  error:      null,

  clearError() { set({ error: null }); },

  async fetchListings() {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.get('/market/listings') as MarketListing[];
      set({ listings: data });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load market' });
    } finally {
      set({ loading: false });
    }
  },

  async fetchMyListings() {
    try {
      const data = await apiClient.get('/market/listings/mine') as MarketListing[];
      set({ myListings: data });
    } catch {
      // silent — shown on the tab itself
    }
  },

  async fetchMyBids() {
    try {
      const data = await apiClient.get('/market/bids/mine') as MarketBid[];
      set({ myBids: data });
    } catch {
      // silent
    }
  },

  async createListing(params) {
    set({ loading: true, error: null });
    try {
      const listing = await apiClient.post('/market/listings', {
        catch_id:     params.catchId,
        make:         params.make,
        model:        params.model,
        generation:   params.generation,
        body_style:   params.bodyStyle,
        color:        params.color,
        rarity:       params.rarity,
        asking_price: params.askingPrice,
      }) as MarketListing;
      set(s => ({ myListings: [listing, ...s.myListings] }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Could not create listing' });
    } finally {
      set({ loading: false });
    }
  },

  async placeBid(listingId, amount) {
    set({ loading: true, error: null });
    try {
      const bid = await apiClient.post('/market/bids', { listing_id: listingId, amount }) as MarketBid;
      set(s => ({
        myBids: [bid, ...s.myBids],
        listings: s.listings.map(l =>
          l.id === listingId
            ? { ...l, topBid: Math.max(l.topBid, amount), bidCount: l.bidCount + 1 }
            : l,
        ),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Bid failed' });
    } finally {
      set({ loading: false });
    }
  },

  async acceptBid(listingId, bidId) {
    set({ loading: true, error: null });
    try {
      await apiClient.post(`/market/listings/${listingId}/accept`, { bid_id: bidId });
      set(s => ({
        myListings: s.myListings.map(l =>
          l.id === listingId ? { ...l, status: 'sold' } : l,
        ),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Could not accept bid' });
    } finally {
      set({ loading: false });
    }
  },

  async cancelListing(listingId) {
    set({ loading: true, error: null });
    try {
      await apiClient.delete(`/market/listings/${listingId}`);
      set(s => ({
        myListings: s.myListings.map(l =>
          l.id === listingId ? { ...l, status: 'cancelled' } : l,
        ),
        listings: s.listings.filter(l => l.id !== listingId),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Could not cancel listing' });
    } finally {
      set({ loading: false });
    }
  },
}));

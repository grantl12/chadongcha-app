/**
 * alpr-wrapper — PRIVACY-CRITICAL native module
 *
 * HARD CONTRACT (enforced at this interface level):
 *   - License plate strings are processed transiently in native memory only
 *   - Plate strings NEVER appear in this module's return value
 *   - Plate strings NEVER written to disk, logs, or analytics
 *   - Only the confidence boost and inferred make/model/year are returned
 *
 * All automated privacy tests in Phase 10 audit this boundary.
 */

import { NativeModules } from 'react-native';

const { ALPRWrapperModule } = NativeModules;

/**
 * The ONLY shape this module is permitted to return.
 * Plate text is ABSENT by design — not redacted, ABSENT.
 */
export type ALPRResult = {
  /** Inferred make from VIN lookup — may be undefined if lookup failed */
  make?: string;
  /** Inferred model from VIN lookup — may be undefined */
  model?: string;
  /** Inferred year from VIN lookup — may be undefined */
  year?: string;
  /**
   * Confidence boost to add to EfficientNet result.
   * Max +0.15 per brief §4.1. 0 if plate unreadable or VIN lookup failed.
   */
  confidenceBoost: number;
  /**
   * The ALPR model's own confidence in how accurately it read the plate
   * characters (0.0–1.0). This is independent of the vehicle classification
   * confidence — it measures OCR quality, not vehicle ID quality.
   *
   * Used by the backend to decide whether to trust the vehicleHash for
   * deduplication. Low confidence reads produce unreliable hashes (a smudged
   * plate might read differently each time), so the backend only uses the
   * hash for dedup when this value exceeds a threshold (≥ 0.85).
   *
   * 0.0 when plate was unreadable.
   */
  plateConfidence: number;
  /**
   * One-way SHA-256 hash of the plate string, computed inside the native
   * module before the plate string is zeroed. Used ONLY for same-vehicle
   * deduplication on the backend.
   *
   * Only trusted for dedup when plateConfidence >= 0.85. Below that,
   * the backend falls back to fuzzy dedup (generation + location + time).
   *
   * Plate string is NEVER recoverable from this hash. null if plate
   * was unreadable.
   */
  vehicleHash: string | null;
};

export interface IALPRWrapper {
  /**
   * Process a vehicle image frame.
   * Plate text is extracted internally, used only for VIN lookup,
   * then zeroed. It is never written to this return value.
   *
   * @param frame  Raw pixel buffer from VisionCamera frame processor
   * @param bbox   Bounding box crop hint from YOLO detection
   */
  process(
    frame: unknown,
    bbox: { x: number; y: number; width: number; height: number }
  ): ALPRResult;
}

export const ALPRWrapper: IALPRWrapper = ALPRWrapperModule;

// ---------------------------------------------------------------------------
// Stub — always returns zero boost, confirms interface shape is correct
// ---------------------------------------------------------------------------

export const ALPRWrapperStub: IALPRWrapper = {
  process(_frame, _bbox): ALPRResult {
    return { confidenceBoost: 0, plateConfidence: 0, vehicleHash: null };
  },
};

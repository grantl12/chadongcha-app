/**
 * model-loader — native module for OTA ML weight hot-swap
 *
 * Downloads new CoreML (.mlpackage) or TFLite (.tflite) weights from
 * Cloudflare R2, performs an atomic swap without app restart, and persists
 * the current version tag across launches.
 *
 * The backend's /model/check endpoint returns a signed R2 URL when a newer
 * version is available. The mobile app calls loadFromUrl() on foreground
 * resume, and the new weights are active for the next Highway Mode session.
 *
 * Real implementation is Phase 3. Stub no-ops all calls.
 */

import { NativeModules } from 'react-native';

const { ModelLoaderModule } = NativeModules;

export interface IModelLoader {
  /**
   * Download model weights from a signed Cloudflare R2 URL and hot-swap.
   * Returns true if swap succeeded without restart, false on failure.
   */
  loadFromUrl(url: string, version: string): Promise<boolean>;

  /**
   * Version string of the currently loaded model (e.g. "0.3.1").
   * Returns "stub-0.0.1" when running the JS stub.
   */
  currentVersion(): string;

  /**
   * Purge cached weights from the documents directory.
   * Called on sign-out or when a version mismatch is detected at startup.
   */
  purge(): Promise<void>;
}

export const ModelLoader: IModelLoader = ModelLoaderModule;

// ---------------------------------------------------------------------------
// Stub — no-ops all calls; used until CoreML/TFLite implementation is built
// ---------------------------------------------------------------------------

export const ModelLoaderStub: IModelLoader = {
  async loadFromUrl(_url: string, _version: string): Promise<boolean> {
    return true;
  },

  currentVersion(): string {
    return 'stub-0.0.1';
  },

  async purge(): Promise<void> {},
};

/**
 * Active instance — automatically selects native or stub based on
 * whether the native module has been compiled in.
 */
export const ActiveModelLoader: IModelLoader = NativeModules.ModelLoaderModule
  ? ModelLoader
  : ModelLoaderStub;

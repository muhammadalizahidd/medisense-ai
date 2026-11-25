import { create } from "zustand";

/** The last state seen on this device. ThemeScript reads the same key before first paint. */
export const AI_STORAGE_KEY = "ms-ai";

type AiSwitch = {
  enabled: boolean;
  /** False in the offline demo, where this browser holds the choice. Null until known. */
  persisted: boolean | null;
  canChange: boolean;
  signedIn: boolean;
};

/** Starts on, to match the server's HTML; AiSwitchSync corrects it straight after mount. */
export const useAiSwitch = create<AiSwitch>()(() => ({
  enabled: true,
  persisted: null,
  canChange: false,
  signedIn: false,
}));

/** Applies a new state to the store, the document and this device. */
export function setAiSwitch(enabled: boolean) {
  useAiSwitch.setState({ enabled });
  if (typeof document === "undefined") return;
  if (enabled) delete document.documentElement.dataset.ai;
  else document.documentElement.dataset.ai = "off";
  try {
    localStorage.setItem(AI_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private windows may refuse storage; the server still holds the choice.
  }
}

/** For code outside React: stores, event handlers and one-off calls. */
export const aiEnabledNow = () => useAiSwitch.getState().enabled;

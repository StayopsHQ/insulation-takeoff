import { Capacitor, registerPlugin } from "@capacitor/core";

export const WhisperVoice = registerPlugin("WhisperVoice");

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export function isWhisperKitAvailable() {
  return isNativePlatform()
    && Capacitor.getPlatform() === "ios"
    && Capacitor.isPluginAvailable("WhisperVoice");
}

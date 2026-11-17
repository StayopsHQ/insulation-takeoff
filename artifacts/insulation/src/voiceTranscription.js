import { Capacitor, registerPlugin } from "@capacitor/core";

export const WhisperVoice = registerPlugin("WhisperVoice");

export function isWhisperKitAvailable() {
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === "ios"
    && Capacitor.isPluginAvailable("WhisperVoice");
}

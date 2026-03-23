// Font loading for Fund Clicker vibes
// Each vibe can use different heading, body, and score display fonts.
// Fonts are loaded via expo-font and cached for the session.
import { useFonts } from "expo-font";
import { PressStart2P_400Regular } from "@expo-google-fonts/press-start-2p";
import { Fredoka_400Regular, Fredoka_600SemiBold, Fredoka_700Bold } from "@expo-google-fonts/fredoka";
import { Orbitron_400Regular, Orbitron_700Bold } from "@expo-google-fonts/orbitron";
import { Quicksand_400Regular, Quicksand_600SemiBold, Quicksand_700Bold } from "@expo-google-fonts/quicksand";
import { Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from "@expo-google-fonts/lora";
import { PlayfairDisplay_400Regular, PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";

// All fonts used by any vibe — loaded once at app start
export const FONT_MAP = {
  PressStart2P_400Regular,
  Fredoka_400Regular,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
  Orbitron_400Regular,
  Orbitron_700Bold,
  Quicksand_400Regular,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
  Lora_400Regular,
  Lora_600SemiBold,
  Lora_700Bold,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
};

// Font family names as they appear in React Native styles
export const FONTS = {
  pressStart: "PressStart2P_400Regular",
  fredoka: "Fredoka_400Regular",
  fredokaSemiBold: "Fredoka_600SemiBold",
  fredokaBold: "Fredoka_700Bold",
  orbitron: "Orbitron_400Regular",
  orbitronBold: "Orbitron_700Bold",
  quicksand: "Quicksand_400Regular",
  quicksandSemiBold: "Quicksand_600SemiBold",
  quicksandBold: "Quicksand_700Bold",
  lora: "Lora_400Regular",
  loraSemiBold: "Lora_600SemiBold",
  loraBold: "Lora_700Bold",
  playfair: "PlayfairDisplay_400Regular",
  playfairSemiBold: "PlayfairDisplay_600SemiBold",
  playfairBold: "PlayfairDisplay_700Bold",
};

// Hook: call once in _layout.js to load all fonts
export function useAppFonts() {
  return useFonts(FONT_MAP);
}

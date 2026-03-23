// Responsive layout hook — returns breakpoint info for adaptive layouts
// Drives: bottom tabs vs sidebar, single vs multi-column, content width cap
import { useWindowDimensions } from "react-native";

export function useLayout() {
  const { width, height } = useWindowDimensions();

  const isPhone = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isWide = width >= 768; // tablet or desktop
  const isLandscape = width > height;

  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    isWide,
    isLandscape,

    // Content max-width (caps game area on wide screens)
    contentMaxWidth: isDesktop ? 560 : isTablet ? 500 : width,

    // Grid columns for shop/skins
    gridColumns: isDesktop ? 3 : isTablet ? 2 : 1,

    // Sidebar width (for tablet/desktop nav)
    sidebarWidth: isDesktop ? 240 : isTablet ? 72 : 0,

    // Coin size multiplier for wider screens
    coinSizeMultiplier: isDesktop ? 1.2 : isTablet ? 1.1 : 1,
  };
}

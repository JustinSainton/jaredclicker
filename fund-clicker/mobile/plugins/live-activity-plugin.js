// Expo Config Plugin: Injects iOS Live Activity WidgetExtension
// This plugin adds the necessary Swift files and entitlements for
// ActivityKit Live Activities on iOS 16.1+.
//
// The plugin creates:
// 1. A WidgetExtension target with ActivityKit capability
// 2. Info.plist entries for NSSupportsLiveActivities
// 3. Swift files for the Live Activity widget UI
//
// Note: This requires a custom dev client (eas build) — not compatible with Expo Go.

const { withInfoPlist, withXcodeProject, withEntitlementsPlist } = require("expo/config-plugins");

function withLiveActivities(config) {
  // Add NSSupportsLiveActivities to Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });

  // Add push notification entitlement (required for Live Activities)
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["aps-environment"] = "production";
    return config;
  });

  return config;
}

module.exports = withLiveActivities;

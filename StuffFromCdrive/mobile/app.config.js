// app.config.js — dynamic config so Mapbox tokens can be injected from EAS env vars
// at build time without being hardcoded in app.json.
//
// EAS env vars used:
//   MAPBOX_DOWNLOADS_TOKEN  — secret token (sk.), used by Gradle to download Mapbox SDK
//   MAPBOX_PUBLIC_TOKEN     — public token (pk.), passed through expo extra → runtime
//   R2_PUBLIC_URL           — public CDN base URL for Cloudflare R2 assets (no trailing slash)

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Chadongcha",
  slug: "chadongcha",
  owner: "chadongcha",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0a0a0a",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.chadongcha.app",
    appleTeamId: "9R34NWWUHD",
    infoPlist: {
      NSCameraUsageDescription:
        "Chadongcha uses your camera to identify and catch vehicles.",
      NSLocationWhenInUseUsageDescription:
        "Chadongcha uses your location to assign catches to road segments and compute satellite passes.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Dash Sentry needs background location to track road segments while driving.",
      NSMotionUsageDescription: "Used for sky pointing in Space Mode.",
      // Mapbox iOS SDK reads this key from Info.plist at startup
      MBXAccessToken: process.env.MAPBOX_PUBLIC_TOKEN ?? "",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0a0a0a",
    },
    package: "com.chadongcha.app",
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_CAMERA",
    ],
  },
  plugins: [
    "expo-router",
    "expo-notifications",
    "./plugins/withVehicleClassifier",
    [
      "react-native-vision-camera",
      {
        cameraPermissionText:
          "Chadongcha uses your camera to identify vehicles.",
        enableMicrophonePermission: false,
      },
    ],
    [
      "@rnmapbox/maps",
      {
        // Secret token — only used at Gradle build time to pull the Mapbox Android SDK.
        // Never ships inside the app binary.
        RNMapboxMapsDownloadsToken: process.env.MAPBOX_DOWNLOADS_TOKEN ?? "",
      },
    ],
  ],
  scheme: "chadongcha",
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "d3e6b66e-6a68-40f4-ad6f-436a459c6dc8",
    },
    // Public Mapbox token — read at runtime via Constants.expoConfig.extra.mapboxPublicToken
    mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN ?? "",
    // Public base URL for Cloudflare R2 (community photos, 3D assets)
    r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",
  },
};

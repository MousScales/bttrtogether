// Load .env file manually since Expo doesn't auto-load all variables
require('dotenv').config();

// Expo automatically loads .env files
// Variables with EXPO_PUBLIC_ prefix are available in process.env
// This config makes them available via Constants.expoConfig.extra

module.exports = {
  expo: {
    name: "bttrtogether",
    slug: "bttrtogether",
    version: "1.0.0",
    owner: "digaifounder",
    orientation: "portrait",
    icon: "./assets/fsf.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mousscales.bttrtogether",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      },
      // URL scheme for Stripe redirects (PayPal, etc.)
      associatedDomains: ["applinks:bttrtogether.app"]
    },
    // URL scheme for deep linking (Stripe redirects)
    scheme: "bttrtogether",
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/fsf.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.mousscales.bttrtogether"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      eas: {
        projectId: "c30cd483-b26d-459c-b7fd-acf9aad7744d"
      },
      // Load Stripe keys from environment variables
      // Try multiple common variable name patterns
      stripePublishableKey: 
        process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
        process.env.STRIPE_PUBLISHABLE_KEY || 
        process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY ||
        process.env.STRIPE_PUBLISHABLE ||
        process.env.STRIPE_KEY ||
        '',
    }
  }
};


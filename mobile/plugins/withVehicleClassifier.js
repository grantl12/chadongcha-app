/**
 * Expo config plugin — VehicleClassifier
 *
 * During `expo prebuild`:
 *  1. Copies vehicle_classifier.mlpackage + class_map.json from assets/ into the
 *     generated ios/<ProjectName>/ directory so Xcode bundles them natively.
 *  2. Adds the local VehicleClassifier pod to the Podfile.
 *
 * The mlpackage is compiled to .mlmodelc by Xcode at build time (no extra steps needed).
 */

const { withDangerousMod, withXcodeProject, withPodfile } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ── 1. Copy model assets into ios/<ProjectName>/ ──────────────────────────────

function withModelAssets(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName;
      const assetsDir   = path.join(projectRoot, 'assets');
      const iosDestDir  = path.join(projectRoot, 'ios', projectName);

      const filesToCopy = [
        'vehicle_classifier.mlpackage',
        'class_map.json',
      ];

      for (const file of filesToCopy) {
        const src = path.join(assetsDir, file);
        const dst = path.join(iosDestDir, file);

        if (!fs.existsSync(src)) {
          console.warn(`[withVehicleClassifier] Missing asset: ${src}`);
          continue;
        }

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          fs.cpSync(src, dst, { recursive: true });
        } else {
          fs.copyFileSync(src, dst);
        }
        console.log(`[withVehicleClassifier] Copied ${file} → ios/${projectName}/`);
      }

      return config;
    },
  ]);
}

// ── 2. Add local pod to Podfile ───────────────────────────────────────────────

function withVehicleClassifierPod(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults;
    const podLine = "  pod 'VehicleClassifier', :path => '../modules/vehicle-classifier'";

    if (!podfile.includes(podLine)) {
      // Insert after the `use_expo_modules!` line
      config.modResults = podfile.replace(
        'use_expo_modules!',
        `use_expo_modules!\n${podLine}`,
      );
    }

    return config;
  });
}

// ── 3. Mark model files as bundle resources in Xcode project ─────────────────

function withModelXcodeResources(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectName  = config.modRequest.projectName;

    ['vehicle_classifier.mlpackage', 'class_map.json'].forEach((file) => {
      // Avoid duplicate entries
      const exists = xcodeProject
        .pbxGroupByName(projectName)
        ?.children?.some((c) => c.comment === file);

      if (!exists) {
        xcodeProject.addResourceFile(file, { target: xcodeProject.getFirstTarget().uuid });
      }
    });

    return config;
  });
}

// ── Compose ───────────────────────────────────────────────────────────────────

module.exports = (config) =>
  withModelXcodeResources(withVehicleClassifierPod(withModelAssets(config)));

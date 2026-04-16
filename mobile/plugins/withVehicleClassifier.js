/**
 * Expo config plugin — VehicleClassifier
 *
 * During `expo prebuild`:
 *  iOS:
 *   1. Copies vehicle_classifier.mlpackage + class_map.json from assets/ into
 *      ios/<ProjectName>/ so Xcode bundles them. Xcode compiles .mlpackage → .mlmodelc.
 *   2. Adds the local VehicleClassifier pod to the Podfile.
 *
 *  Android:
 *   3. Copies vehicle_classifier.tflite + class_map.json into
 *      android/app/src/main/assets/ so they're accessible via AssetManager at runtime.
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
    // In @expo/config-plugins >=9, modResults is { path, contents, language },
    // not a raw string. Access .contents and write it back into the object.
    const podLine = "  pod 'VehicleClassifier', :path => '../modules/vehicle-classifier'";
    const { contents } = config.modResults;

    if (!contents.includes(podLine)) {
      config.modResults = {
        ...config.modResults,
        contents: contents.replace(
          'use_expo_modules!',
          `use_expo_modules!\n${podLine}`,
        ),
      };
    }

    return config;
  });
}

// ── 3. Mark model files as bundle resources in Xcode project ─────────────────

function withModelXcodeResources(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectName  = config.modRequest.projectName;
    const target       = xcodeProject.getFirstTarget().uuid;

    // Find the main project group key so addResourceFile doesn't fall back
    // to the non-existent 'Resources' group and crash on null.path
    const groupKey = xcodeProject.findPBXGroupKey({ name: projectName });

    ['vehicle_classifier.mlpackage', 'class_map.json'].forEach((file) => {
      // Skip if already registered
      const group = groupKey ? xcodeProject.getPBXGroupByKey(groupKey) : null;
      const exists = group?.children?.some((c) => c.comment === file);
      if (exists) return;

      try {
        // Only pass groupKey when it is non-null — passing null causes xcode-js
        // to crash trying to read group.path.
        if (groupKey) {
          xcodeProject.addResourceFile(file, { target }, groupKey);
        } else {
          xcodeProject.addResourceFile(file, { target });
        }
      } catch (e) {
        console.warn(`[withVehicleClassifier] Could not add ${file} to Xcode project: ${e.message}`);
      }
    });

    return config;
  });
}

// ── 4. Copy tflite + class_map into android/app/src/main/assets/ ─────────────

function withAndroidModelAssets(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot  = config.modRequest.projectRoot;
      const assetsDir    = path.join(projectRoot, 'assets');
      const androidAssets = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets');

      fs.mkdirSync(androidAssets, { recursive: true });

      const filesToCopy = [
        'vehicle_classifier.tflite',
        'class_map.json',
      ];

      for (const file of filesToCopy) {
        const src = path.join(assetsDir, file);
        const dst = path.join(androidAssets, file);
        if (!fs.existsSync(src)) {
          console.warn(`[withVehicleClassifier] Missing asset: ${src}`);
          continue;
        }
        fs.copyFileSync(src, dst);
        console.log(`[withVehicleClassifier] Copied ${file} → android/app/src/main/assets/`);
      }

      return config;
    },
  ]);
}

// ── Compose ───────────────────────────────────────────────────────────────────

module.exports = (config) =>
  withAndroidModelAssets(
    withModelXcodeResources(withVehicleClassifierPod(withModelAssets(config)))
  );

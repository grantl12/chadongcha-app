import ExpoModulesCore
import Vision
import CoreML
import UIKit

public class VehicleClassifierModule: Module {
  private var vnModel: VNCoreMLModel?
  private var loadedVersion: String = "unloaded"

  public func definition() -> ModuleDefinition {
    Name("VehicleClassifier")

    OnCreate {
      self.loadModel()
    }

    // Synchronous — returns the version string of the loaded .mlmodelc.
    Function("modelVersion") { () -> String in
      return self.loadedVersion
    }

    // Async — runs VNCoreMLRequest on the image at imagePath.
    // Returns a dictionary matching ClassifyResult, or nil on miss / low-confidence.
    AsyncFunction("classify") { (imagePath: String, promise: Promise) in
      guard let vnModel = self.vnModel else {
        promise.resolve(nil as [String: Any]?)
        return
      }

      guard let cgImage = Self.loadCGImage(from: imagePath) else {
        promise.resolve(nil as [String: Any]?)
        return
      }

      let request = VNCoreMLRequest(model: vnModel) { req, error in
        guard error == nil,
              let results = req.results as? [VNClassificationObservation],
              let top = results.first,
              top.identifier != "_Background"
        else {
          promise.resolve(nil as [String: Any]?)
          return
        }

        let parsed = Self.parseLabel(top.identifier)
        promise.resolve([
          "make":        parsed.make,
          "model":       parsed.model,
          "generation":  parsed.generation,
          "bodyStyle":   "",   // not predicted by this model — resolved from vehicle DB
          "color":       "",   // not predicted by this model — resolved from vehicle DB
          "confidence":  Double(top.confidence),
          "boundingBox": ["x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0],
        ] as [String: Any])
      }

      request.imageCropAndScaleOption = .centerCrop

      do {
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])
      } catch {
        promise.resolve(nil as [String: Any]?)
      }
    }
  }

  // MARK: – Model loading

  private func loadModel() {
    guard let modelURL = Bundle.main.url(forResource: "vehicle_classifier", withExtension: "mlmodelc") else {
      print("[VehicleClassifier] vehicle_classifier.mlmodelc not found in bundle")
      return
    }
    do {
      let mlModel = try MLModel(contentsOf: modelURL)
      vnModel = try VNCoreMLModel(for: mlModel)
      loadedVersion = mlModel.modelDescription.metadata[MLModelMetadataKey.versionString] as? String ?? "0.2.0"
      print("[VehicleClassifier] Loaded — version \(loadedVersion)")
    } catch {
      print("[VehicleClassifier] Failed to load model: \(error)")
    }
  }

  // MARK: – Image loading

  private static func loadCGImage(from path: String) -> CGImage? {
    if let image = UIImage(contentsOfFile: path) {
      return image.cgImage
    }
    // Handle file:// URLs passed from VisionCamera
    let stripped = path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
    return UIImage(contentsOfFile: stripped)?.cgImage
  }

  // MARK: – Class-label parser
  //
  // Class names follow two conventions from bootstrap.py:
  //   Year-prefixed:  "2021_Tesla_Model_S"  → make=Tesla  model=Model S  generation=2021
  //   Standard:       "Toyota_GR86_ZN8"     → make=Toyota model=GR86     generation=ZN8
  //                   "Nissan_GT-R"         → make=Nissan model=GT-R      generation=""
  //                   "Jeep_Grand_Cherokee_WL" → make=Jeep model=Grand Cherokee  generation=WL
  //
  // Parsing is best-effort; the backend /vehicles/resolve endpoint has fuzzy fallback.

  private static func parseLabel(_ label: String) -> (make: String, model: String, generation: String) {
    let parts = label.components(separatedBy: "_")

    // Year-prefixed  (first part is a 4-digit year)
    if let year = Int(parts[0]), year > 1900, year < 2100, parts.count >= 2 {
      let make = parts[1]
      let model = parts.count > 2 ? parts[2...].joined(separator: " ") : ""
      return (make, model, parts[0])
    }

    switch parts.count {
    case 1:
      return (parts[0], "", "")
    case 2:
      // e.g. "Nissan_GT-R", "Acura_NSX", "Mazda3_BP"
      return (parts[0], parts[1], "")
    case 3:
      // e.g. "Toyota_GR86_ZN8", "BMW_3-Series_G20"
      return (parts[0], parts[1], parts[2])
    default:
      // e.g. "Jeep_Grand_Cherokee_WL" → make=Jeep, model=Grand Cherokee, generation=WL
      let make = parts[0]
      let generation = parts[parts.count - 1]
      let model = parts[1..<(parts.count - 1)].joined(separator: " ")
      return (make, model, generation)
    }
  }
}

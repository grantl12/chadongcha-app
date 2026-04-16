package expo.modules.vehicleclassifier

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import org.json.JSONObject
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class VehicleClassifierModule : Module() {

  private var interpreter: org.tensorflow.lite.Interpreter? = null
  private var classNames: List<String> = emptyList()
  private var loadedVersion: String = "unloaded"

  companion object {
    private const val MODEL_FILE   = "vehicle_classifier.tflite"
    private const val LABELS_FILE  = "class_map.json"
    private const val INPUT_SIZE   = 224
    private const val PIXEL_SIZE   = 3
    private const val FLOAT_BYTES  = 4
  }

  override fun definition() = ModuleDefinition {
    Name("VehicleClassifier")

    OnCreate {
      loadModel()
    }

    Function("modelVersion") {
      loadedVersion
    }

    AsyncFunction("classify") { imagePath: String, promise: Promise ->
      val interp = interpreter
      if (interp == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val bitmap = loadBitmap(imagePath)
      if (bitmap == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val resized   = centerCropAndResize(bitmap, INPUT_SIZE)
      val inputBuf  = bitmapToByteBuffer(resized)
      val output    = Array(1) { FloatArray(classNames.size) }

      interp.run(inputBuf, output)

      val scores     = output[0]
      val topIdx     = scores.indices.maxByOrNull { scores[it] } ?: run { promise.resolve(null); return@AsyncFunction }
      val topLabel   = classNames.getOrElse(topIdx) { "_Background" }
      val confidence = scores[topIdx].toDouble()

      if (topLabel == "_Background") {
        promise.resolve(null)
        return@AsyncFunction
      }

      val parsed = parseLabel(topLabel)
      promise.resolve(mapOf(
        "make"        to parsed.first,
        "model"       to parsed.second,
        "generation"  to parsed.third,
        "bodyStyle"   to "",
        "color"       to "",
        "confidence"  to confidence,
        "boundingBox" to mapOf("x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0),
      ))
    }
  }

  // ── Model loading ─────────────────────────────────────────────────────────

  private fun loadModel() {
    try {
      val ctx = appContext.reactContext ?: return

      // Load TFLite model from assets
      val modelBuffer = loadAssetFile(MODEL_FILE)
      interpreter = org.tensorflow.lite.Interpreter(modelBuffer)
      loadedVersion = "0.2.0"

      // Load class map from assets
      val labelsJson = ctx.assets.open(LABELS_FILE).bufferedReader().readText()
      val obj = JSONObject(labelsJson)
      val map = (0 until obj.length()).associate { i -> i to obj.getString(i.toString()) }
      classNames = map.values.toList()

      android.util.Log.i("VehicleClassifier", "Loaded — ${classNames.size} classes, version $loadedVersion")
    } catch (e: Exception) {
      android.util.Log.e("VehicleClassifier", "Failed to load model: ${e.message}")
    }
  }

  private fun loadAssetFile(filename: String): MappedByteBuffer {
    val ctx = appContext.reactContext!!
    val fd  = ctx.assets.openFd(filename)
    val fis = FileInputStream(fd.fileDescriptor)
    return fis.channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
  }

  // ── Image preprocessing ───────────────────────────────────────────────────

  private fun loadBitmap(path: String): Bitmap? {
    val cleanPath = if (path.startsWith("file://")) path.removePrefix("file://") else path
    return try { BitmapFactory.decodeFile(cleanPath) } catch (e: Exception) { null }
  }

  private fun centerCropAndResize(src: Bitmap, size: Int): Bitmap {
    val dim   = minOf(src.width, src.height)
    val left  = (src.width  - dim) / 2
    val top   = (src.height - dim) / 2
    val cropped = Bitmap.createBitmap(src, left, top, dim, dim)
    return Bitmap.createScaledBitmap(cropped, size, size, true)
  }

  private fun bitmapToByteBuffer(bitmap: Bitmap): ByteBuffer {
    val buf = ByteBuffer.allocateDirect(FLOAT_BYTES * INPUT_SIZE * INPUT_SIZE * PIXEL_SIZE)
    buf.order(ByteOrder.nativeOrder())

    val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
    bitmap.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)

    for (px in pixels) {
      buf.putFloat(((px shr 16 and 0xFF) / 255.0f))  // R
      buf.putFloat(((px shr 8  and 0xFF) / 255.0f))  // G
      buf.putFloat(((px        and 0xFF) / 255.0f))  // B
    }
    buf.rewind()
    return buf
  }

  // ── Label parsing — mirrors VehicleClassifierModule.swift ─────────────────

  private data class Triple(val first: String, val second: String, val third: String)

  private fun parseLabel(label: String): Triple {
    val parts = label.split("_")

    // Year-prefixed: "2021_Tesla_Model_S"
    val year = parts[0].toIntOrNull()
    if (year != null && year in 1900..2100 && parts.size >= 2) {
      val make  = parts[1]
      val model = if (parts.size > 2) parts.drop(2).joinToString(" ") else ""
      return Triple(make, model, parts[0])
    }

    return when (parts.size) {
      1    -> Triple(parts[0], "", "")
      2    -> Triple(parts[0], parts[1], "")
      3    -> Triple(parts[0], parts[1], parts[2])
      else -> Triple(parts[0], parts.subList(1, parts.size - 1).joinToString(" "), parts.last())
    }
  }
}

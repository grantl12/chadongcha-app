package expo.modules.vehicleclassifier

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.Package

class VehicleClassifierPackage : Package {
  override fun createModules(): List<Module> = listOf(VehicleClassifierModule())
}

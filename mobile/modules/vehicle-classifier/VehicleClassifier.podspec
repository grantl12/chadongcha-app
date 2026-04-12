Pod::Spec.new do |s|
  s.name           = 'VehicleClassifier'
  s.version        = '1.0.0'
  s.summary        = 'CoreML vehicle classifier for ChaDongCha'
  s.description    = 'Expo native module — ResNet50V2 CoreML inference via Vision framework'
  s.author         = 'ChaDongCha'
  s.homepage       = 'https://github.com/grantl12/ChaDongCha'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :path => '.' }
  s.source_files   = 'ios/**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'
end

Pod::Spec.new do |s|
  s.name             = 'IPAShip'
  s.version          = '1.0.0'
  s.summary          = 'ipaShip Swift/CocoaPods client.'
  s.homepage         = 'https://ipaship.com'
  s.author           = { 'async-atharv' => 'hello@ipaship.com' }
  s.source           = { :git => 'https://github.com/async-atharv/ipaShip.git', :tag => s.version.to_s }
  s.ios.deployment_target = '13.0'
  s.source_files = 'Sources/IPAShip/**/*'
end
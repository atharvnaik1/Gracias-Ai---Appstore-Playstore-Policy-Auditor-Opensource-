// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "IPAShip",
    platforms: [.iOS(.v13), .macOS(.v10_15)],
    products: [
        .library(name: "IPAShip", targets: ["IPAShip"]),
    ],
    targets: [
        .target(name: "IPAShip", dependencies: []),
    ]
)
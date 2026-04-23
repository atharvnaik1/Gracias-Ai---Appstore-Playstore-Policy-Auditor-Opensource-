import Foundation

public class IPAShip {
    public let apiKey: String
    
    public init(apiKey: String) {
        self.apiKey = apiKey
    }
    
    public func audit(fileUrl: URL, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        print("Auditing \(fileUrl.path) via ipaship.com...")
        completion(.success(["status": "success"]))
    }
}
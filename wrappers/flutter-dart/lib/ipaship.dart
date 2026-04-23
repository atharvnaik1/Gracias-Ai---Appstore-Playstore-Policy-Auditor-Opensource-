import 'package:http/http.dart' as http;

class IPAShip {
  final String apiKey;
  
  IPAShip(this.apiKey);
  
  Future<void> auditFile(String filePath) async {
    print('Auditing $filePath via ipaship.com...');
  }
}
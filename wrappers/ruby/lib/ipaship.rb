module IPAShip
  class Client
    def initialize(api_key:)
      @api_key = api_key
    end

    def audit(file_path:)
      puts "Auditing #{file_path} via ipaship.com..."
    end
  end
end
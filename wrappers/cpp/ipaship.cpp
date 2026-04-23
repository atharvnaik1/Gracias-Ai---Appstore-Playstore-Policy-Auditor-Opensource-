#include "ipaship.hpp"
#include <iostream>

namespace IPAShip {
    Auditor::Auditor(const std::string& api_key) : api_key_(api_key) {}
    void Auditor::audit(const std::string& file_path) {
        std::cout << "Auditing " << file_path << " via ipaship.com..." << std::endl;
    }
}
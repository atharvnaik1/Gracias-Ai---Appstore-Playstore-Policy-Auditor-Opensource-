#pragma once
#include <string>

namespace IPAShip {
    class Auditor {
    public:
        Auditor(const std::string& api_key);
        void audit(const std::string& file_path);
    private:
        std::string api_key_;
    };
}
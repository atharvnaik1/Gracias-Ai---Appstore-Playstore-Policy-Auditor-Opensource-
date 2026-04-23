<?php
namespace IPAShip;

class IPAShipClient {
    private $apiKey;

    public function __construct(string $apiKey) {
        $this->apiKey = $apiKey;
    }

    public function audit(string $filePath) {
        echo "Auditing {$filePath} via ipaship.com...\n";
    }
}
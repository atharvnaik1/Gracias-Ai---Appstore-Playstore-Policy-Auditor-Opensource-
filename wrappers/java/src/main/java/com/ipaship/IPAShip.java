package com.ipaship;

public class IPAShip {
    private final String apiKey;

    public IPAShip(String apiKey) {
        this.apiKey = apiKey;
    }

    public void audit(String filePath) {
        System.out.println("Auditing " + filePath + " via ipaship.com...");
    }
}
package com.ipaship

class IPAShip(private val apiKey: String) {
    fun audit(filePath: String) {
        println("Auditing $filePath via ipaship.com...")
    }
}
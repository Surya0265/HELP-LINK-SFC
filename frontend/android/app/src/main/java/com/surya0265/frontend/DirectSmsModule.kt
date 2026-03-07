package com.surya0265.frontend

import android.telephony.SmsManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class DirectSmsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "DirectSms"
    }

    @ReactMethod
    fun sendDirectSms(phoneNumber: String, message: String, promise: Promise) {
        try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(message)
            smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SMS_ERROR", e.message)
        }
    }
}

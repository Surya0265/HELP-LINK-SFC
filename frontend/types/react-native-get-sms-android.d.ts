declare module 'react-native-get-sms-android' {
  export interface SmsFilter {
    box?: string;
    read?: number;
    _id?: number;
    address?: string;
    body?: string;
    creator?: string;
    date?: number;
    date_sent?: number;
    error_code?: number;
    locked?: number;
    protocol?: number;
    person?: string;
    reply_path_present?: number;
    subject?: string;
    thread_id?: number;
    type?: number;
    service_center?: string;
    status?: number;
    maxCount?: number;
    indexFrom?: number;
  }

  export interface SmsMessage {
    _id: number;
    thread_id: number;
    address: string;
    person: string;
    date: number;
    date_sent: number;
    protocol: number;
    read: number;
    status: number;
    type: number;
    reply_path_present: number;
    subject: string;
    body: string;
    service_center: string;
    locked: number;
    error_code: number;
    creator: string;
  }

  export default class SmsAndroid {
    static list(
      filter: string,
      fail: (err: any) => void,
      success: (count: number, smsList: string) => void
    ): void;
    static send(
      addresses: string,
      text: string,
      fail: (err: any) => void,
      success: (message: string) => void
    ): void;
    static autoSend(
      phoneNumber: string,
      message: string,
      fail: (err: any) => void,
      success: (message: string) => void
    ): void;
  }
}

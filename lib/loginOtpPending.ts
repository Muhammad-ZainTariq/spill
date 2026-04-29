import AsyncStorage from '@react-native-async-storage/async-storage';

/** Must match login flow — cleared on logout so OTP step isn't restored without password. */
export const LOGIN_OTP_PENDING_KEY = '@spill_login_otp_pending_v1';
export const LOGIN_OTP_PENDING_MAX_MS = 15 * 60 * 1000;

export async function persistLoginOtpPending(emailTrimmed: string) {
  await AsyncStorage.setItem(
    LOGIN_OTP_PENDING_KEY,
    JSON.stringify({ email: emailTrimmed, at: Date.now() })
  );
}

export async function clearLoginOtpPending() {
  await AsyncStorage.removeItem(LOGIN_OTP_PENDING_KEY);
}

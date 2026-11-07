import * as crypto from 'crypto';
import { UserRole } from './../user/users.entity';

// Utility function to validate if the input is an email or not
export const validateEmail = (input: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input);
};
// Utility function to generate OTP (6 digits)
export const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString(); // Generates a 6-digit OTP
};
// Placeholder function to send OTP via email
export const sendOtpEmail = async (
  email: string,
  otp: string,
): Promise<void> => {
  // Implement actual email sending logic here
  console.log(`OTP sent to email ${email}: ${otp}`);
};

// Placeholder function to send OTP via SMS
export const sendOtpSms = async (
  mobile: string,
  otp: string,
): Promise<void> => {
  // Implement actual SMS sending logic here
  console.log(`OTP sent to mobile ${mobile}: ${otp}`);
};

export function isAdmin(userRole: UserRole): userRole is UserRole.Admin {
  return userRole === UserRole.Admin;
}

export function isVendor(userRole: UserRole): userRole is UserRole.Vendor {
  return userRole === UserRole.Vendor;
}

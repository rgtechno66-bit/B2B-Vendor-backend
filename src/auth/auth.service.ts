// src/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthDto } from './auth.dto';
import { JwtService } from '@nestjs/jwt';
import { CreateAddressDto } from './../addresses/addresses.dto';
import { UserEntity } from './../user/users.entity';
import { UserRole, UserStatus } from './../user/users.entity';
import { EmailService } from './../service/email.service';
import { AddressesService } from './../addresses/addresses.service';
import { SMSService } from './../service/sms.service';
import { v4 as uuidv4 } from 'uuid'; // Install uuid for unique session tokens

const generateOTP = (): string => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
  return otp;
};

const validateEmail = (input: string | undefined): boolean => {
  if (!input) return false; // If input is undefined, return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input);
};

// Dummy functions to simulate sending OTP via email or SMS
const sendOtpEmail = async (email: string, otp: string) => {
  console.log(`Sending OTP ${otp} to email: ${email}`);
  // Implement actual email sending logic here
};

const sendOtpSms = async (mobile: string, otp: string) => {
  console.log(`Sending OTP ${otp} to mobile: ${mobile}`);
  // Implement actual SMS sending logic here
};
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly JwtService: JwtService, // Inject JwtService
    private readonly emailService: EmailService,
    private readonly smsService: SMSService,

    // private readonly mailerService: MailerService, // If used
    private readonly addressesService: AddressesService,
  ) {}

  async register(
    authDto: AuthDto,
  ): Promise<{ message: string; user: UserEntity }> {
    try {
      // Check if the email or mobile already exists
      const existingUser = await this.userRepository.findOne({
        where: [{ email: authDto.email }, { mobile: authDto.mobile }],
      });

      if (existingUser) {
        throw new BadRequestException('Email or Mobile number already exists');
      }

      // Create the new user
      const newUser = this.userRepository.create({
        ...authDto,
        role: UserRole.Vendor, // Default role to Vendor
        slNo: 'N/A', // Default values for other fields
        alias: 'N/A',
        active: 'N/A',
        contactPerson: 'N/A',
        pan: 'N/A',
        gstType: 'N/A',
        gstNo: 'N/A',
        gstDetails: 'N/A',
        isDeleted: false,
      });

      await this.userRepository.save(newUser); // Save the new user

      const createAddressDto: CreateAddressDto = {
        mobile: authDto.mobile,
        street_address: authDto.address,
        country: authDto.country,
        state: authDto.state,
        zip_code: authDto.pincode,
        userId: newUser.id,
      };

      const existingAddress = await this.addressesService.findByUserId(
        newUser.id,
      );

      if (existingAddress) {
        await this.addressesService.update(
          existingAddress.id,
          createAddressDto,
        );
      } else {
        await this.addressesService.create(createAddressDto, newUser.id);
      }

      return {
        message: 'User data Added successfully',
        user: newUser,
      };
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // Send OTP for verification
  async verifyOtp(authDto: AuthDto): Promise<{ message: string }> {
    try {
      const contact = authDto.contact;
      if (!contact) {
        throw new BadRequestException(
          'Either email or mobile number must be provided.',
        );
      }

      const isEmail = validateEmail(contact);
      const whereCondition = isEmail
        ? { email: contact, isDeleted: false }
        : { mobile: contact, isDeleted: false };

      // Find the user based on the constructed where condition
      const user = await this.userRepository.findOne({ where: whereCondition });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      // Check if the user's status is Suspended
      if (user.status === UserStatus.Inactive) {
        throw new UnauthorizedException(
          'You are Inactive.Please contact the admin or company for assistance.',
        );
      }

      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration

      // Hash OTP and save
      user.otp = await bcrypt.hash(otp, 10);
      user.otpExpires = otpExpires;
      await this.userRepository.save(user); // Save the updated user

      // Send OTP
      isEmail
        ? await this.emailService.sendOTP(user.email, otp)
        : await this.smsService.sendTextOTP(user.mobile, otp);

      return { message: 'OTP sent successfully' };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'OTP failed. Please check your credentials and try again.',
        error.message,
      );
    }
  }

  // Login user with OTP
  async login(authDto: AuthDto): Promise<{
    message: string;
    access_token: string;
    user: Partial<UserEntity>;
  }> {
    try {
      const contact = authDto.contact;
      if (!contact) {
        throw new BadRequestException(
          'Either email or mobile number must be provided.',
        );
      }
      const isEmail = validateEmail(contact);
      const whereCondition = isEmail
        ? { email: contact, isDeleted: false }
        : { mobile: contact, isDeleted: false };

      // Find the user based on the constructed where condition
      const user = await this.userRepository.findOne({ where: whereCondition });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check OTP validity
      if (!user.otp || !user.otpExpires || user.otpExpires < new Date()) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      if (!authDto.otp) {
        throw new UnauthorizedException('OTP must be provided.');
      }

      // Verify OTP
      const isOtpValid = await bcrypt.compare(authDto.otp, user.otp);
      if (!isOtpValid) {
        throw new UnauthorizedException('Invalid OTP');
      }

      // Generate a new sessionToken and invalidate old sessions
      const newSessionToken = uuidv4();

      // Clear OTP after successful login
      user.otp = null;
      user.otpExpires = null;
      user.sessionToken = newSessionToken;

      await this.userRepository.save(user); // Save the updated user
      const payload = {
        email: user.email,
        id: user.id,
        role: user.role,
        name: user.name,
        sessionToken: newSessionToken,
      };

      // Exclude otp and otpExpires from the returned user
      const { otp, otpExpires, isDeleted, sessionToken, ...userWithoutOtp } =
        user;

      return {
        message: 'User Logged in successfully',
        user: userWithoutOtp,
        access_token: this.JwtService.sign(payload),
      };
    } catch (error: any) {
      // Return a custom error response in case of any exception
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Login failed. Please check your credentials and try again.',
        error.message,
      );
    }
  }
}

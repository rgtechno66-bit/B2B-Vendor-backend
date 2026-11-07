//users.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserEntity, UserRole, UserStatus } from './users.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressEntity } from './../addresses/addresses.entity';
import { FileStorageService } from './../service/file-storage.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(AddressEntity)
    private addressRepository: Repository<AddressEntity>,
    private fileStorageService: FileStorageService,
  ) {}

  async updateUserStatus(id: string, status: UserStatus): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!Object.values(UserStatus).includes(status)) {
      throw new ConflictException('Invalid user status');
    }

    user.status = status;
    await this.userRepository.save(user);

    return user;
  }

  async getAdminState(): Promise<string | null> {
    const admin = await this.userRepository.findOne({
      where: { role: UserRole.Admin },
      // select: ['state'], // Only fetch the `state` column
    });
    return admin?.state ?? null; // Return state if found, otherwise null
  }

  async getUserState(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['state'],
    });
    return user?.state ?? null; // Return state if found, otherwise null
  }

  async getAll(): Promise<UserEntity[]> {
    return await this.userRepository.find({
      where: { isDeleted: false },
      relations: ['addresses'], // Ensure addresses are loaded
    });
  }

  async findAllVendors(): Promise<UserEntity[]> {
    return this.userRepository.find({ where: { role: UserRole.Vendor } });
  }

  async getById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id, isDeleted: false },
    }); // Correct way to find by ID
    if (!user) {
      throw new NotFoundException('User not found or has been deleted');
    }
    return user;
  }

  async delete(id: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id } }); // Correct way to find by ID
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isDeleted = true;
    await this.userRepository.save(user);
    // await this.userRepository.remove(user);
    return { message: 'User deleted successfully' };
  }

  async updateAdminProfile(
    id: string,
    updateData: Partial<UserEntity>,
    userId: string,
    userRole: string | UserRole,
    file?: Express.Multer.File,
  ): Promise<UserEntity> {
    // Verify user is admin (role can be string or UserRole enum)
    const isAdminRole = userRole === UserRole.Admin || userRole === 'Admin';
    if (!isAdminRole) {
      throw new ConflictException('Only admins can update their profile');
    }

    // Verify admin is updating their own profile
    if (id !== userId) {
      throw new ConflictException('You can only update your own profile');
    }

    const admin = await this.userRepository.findOne({
      where: { id, role: UserRole.Admin },
    });
    if (!admin) {
      throw new NotFoundException('Admin profile not found');
    }

    // Handle profile picture upload if file is provided
    if (file) {
      try {
        // Delete old profile picture from Cloudinary if exists
        if (admin.profile) {
          try {
            await this.fileStorageService.deleteSingleFile(admin.profile);
          } catch (error) {
            // Silently continue if deletion fails
          }
        }

        // Upload new profile picture to Cloudinary
        const fileName = `${Date.now()}-${file.originalname}`;
        const profileUrl = await this.fileStorageService.uploadImage(
          file.buffer,
          'profiles',
          fileName,
        );
        admin.profile = profileUrl;
      } catch (error) {
        throw new ConflictException('Failed to upload profile picture');
      }
    } else if (updateData.profile !== undefined) {
      // If profile is sent as a string (URL), update it directly
      admin.profile = updateData.profile;
    }

    // Update allowed fields
    if (updateData.name !== undefined) admin.name = updateData.name;
    if (updateData.email !== undefined) admin.email = updateData.email;
    if (updateData.mobile !== undefined) admin.mobile = updateData.mobile;
    if (updateData.address !== undefined) admin.address = updateData.address;
    if (updateData.state !== undefined) admin.state = updateData.state;
    if (updateData.country !== undefined) admin.country = updateData.country;
    if (updateData.pincode !== undefined) admin.pincode = updateData.pincode;

    await this.userRepository.save(admin);
    return admin;
  }
}

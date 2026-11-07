import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAddressDto, UpdateAddressDto } from './addresses.dto';
import { AddressEntity } from './addresses.entity';
import { UserEntity } from './../user/users.entity';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(AddressEntity)
    private addressesRepository: Repository<AddressEntity>,

    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  async getAll(): Promise<AddressEntity[]> {
    const address = await this.addressesRepository.find();
    return address;
  }

  async create(
    createAddressDto: CreateAddressDto,
    userId: string,
  ): Promise<AddressEntity> {
    // Step 1: Fetch the user entity by userId
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Step 2: Check if the user exists
    if (!user) {
      throw new Error('User not found');
    }

    // Step 3: Create a new address instance
    const address = this.addressesRepository.create(createAddressDto);

    // Step 4: Assign the fetched user entity to the address
    address.user = user; // Link the user to the address

    // Step 5: Save the address with the associated user
    return this.addressesRepository.save(address);
  }

  async findByUserId(userId: string): Promise<AddressEntity | null> {
    return this.addressesRepository.findOne({
      where: { user: { id: userId } },
    });
  }

  async findByUserIds(userId: string): Promise<AddressEntity | null> {
    const res = await this.addressesRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!res) {
      throw new NotFoundException('Address not found');
    }
    return res;
  }

  // Service method to fetch all addresses for a user
  async findByUserAll(userId: string): Promise<AddressEntity[]> {
    const res = await this.addressesRepository.find({
      where: { user: { id: userId } },
    });

    if (res.length === 0) {
      throw new NotFoundException('No addresses found for this user');
    }

    return res;
  }

  async getById(id: string): Promise<AddressEntity> {
    const address = await this.addressesRepository.findOne({ where: { id } }); // Correct way to find by ID
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  async update(
    id: string,
    updateAddressDto: UpdateAddressDto,
  ): Promise<AddressEntity> {
    const address = await this.getById(id);
    Object.assign(address, updateAddressDto);
    return this.addressesRepository.save(address);
  }

  async delete(id: string): Promise<{ message: string }> {
    const address = await this.getById(id);
    await this.addressesRepository.remove(address);
    return { message: 'Address deleted successfully' };
  }
}

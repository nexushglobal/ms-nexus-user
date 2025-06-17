import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UpdateBankInfoDto } from '../dto/update-back-info.dto';
import { UpdateBillingInfoDto } from '../dto/update-billing-info.dto';
import { UpdateContactInfoDto } from '../dto/update-conteact-info.dto';
import { UpdatePersonalInfoDto } from '../dto/update-profile-info.dto';
import { ProfileService } from '../services/profile.service';
import { UpdatePhotoDto } from '../dto/update-photo-dto';

@Controller()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @MessagePattern({ cmd: 'user.profile.getUserProfile' })
  getUserProfile(@Payload() data: { userId: string }) {
    return this.profileService.getUserProfile(data.userId);
  }

  @MessagePattern({ cmd: 'user.profile.updateContactInfo' })
  updateContactInfo(
    @Payload()
    data: {
      userId: string;
      updateContactInfoDto: UpdateContactInfoDto;
    },
  ) {
    return this.profileService.updateContactInfo(
      data.userId,
      data.updateContactInfoDto,
    );
  }

  @MessagePattern({ cmd: 'user.profile.updateBillingInfo' })
  updateBillingInfo(
    @Payload()
    data: {
      userId: string;
      updateBillingInfoDto: UpdateBillingInfoDto;
    },
  ) {
    return this.profileService.updateBillingInfo(
      data.userId,
      data.updateBillingInfoDto,
    );
  }

  @MessagePattern({ cmd: 'user.profile.updateBankInfo' })
  updateBankInfo(
    @Payload() data: { userId: string; updateBankInfoDto: UpdateBankInfoDto },
  ) {
    return this.profileService.updateBankInfo(
      data.userId,
      data.updateBankInfoDto,
    );
  }

  @MessagePattern({ cmd: 'user.profile.updatePersonalInfo' })
  updatePersonalInfo(
    @Payload()
    data: {
      userId: string;
      updatePersonalInfoDto: UpdatePersonalInfoDto;
    },
  ) {
    return this.profileService.updatePersonalInfo(
      data.userId,
      data.updatePersonalInfoDto,
    );
  }

  @MessagePattern({ cmd: 'user.profile.updatePhoto' })
  updatePhoto(
    @Payload() data: { userId: string; updatePhotoDto: UpdatePhotoDto },
  ) {
    return this.profileService.updatePhoto(data.userId, data.updatePhotoDto);
  }
}

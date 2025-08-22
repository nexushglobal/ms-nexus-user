import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { GetUserInfoDto } from '../dto/get-user-info.dto';
import { UserInfoResponseDto } from '../dto/user-info-response.dto';
import { UserInfoService } from '../services/user-info.service';

@Controller()
export class UserInfoController {
  constructor(private readonly userInfoService: UserInfoService) {}

  @MessagePattern({ cmd: 'get.user.info' })
  async getUserInfo(
    @Payload() getUserInfoDto: GetUserInfoDto,
  ): Promise<UserInfoResponseDto> {
    return this.userInfoService.getUserInfo(getUserInfoDto);
  }
}

import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  findAll() {
    return this.usersService.findAllBasic();
  }

  // Every role may fetch their own softphone credentials — this is scoped
  // to the caller (@CurrentUser), not the ADMIN/SALES_MANAGER-only /users
  // list above.
  @Get('me/sip-credentials')
  getMySipCredentials(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getSipCredentials(user.id);
  }
}

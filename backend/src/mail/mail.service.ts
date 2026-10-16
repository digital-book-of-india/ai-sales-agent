import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordResetEmail(email: string, resetToken: string) {
    this.logger.log(
      `Password reset requested for ${email}. Reset token: ${resetToken}`,
    );
    return Promise.resolve();
  }

  // Same posture as sendPasswordResetEmail — no real SMTP integration yet,
  // just a log line. The account's password was already set by the inviting
  // admin/manager on the invite form (see TeamService.invite) and shared
  // with the new hire out of band, so there's no token/link to send here.
  async sendTeamInviteEmail(email: string, name: string) {
    this.logger.log(
      `Team invite: account created for ${name} <${email}>. They can log in with the password you set.`,
    );
    return Promise.resolve();
  }
}

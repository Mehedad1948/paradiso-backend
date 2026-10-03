import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class GoogleAuthenticationService {
  authentication(): never {
    throw new NotImplementedException('Google sign-in is not enabled');
  }
}

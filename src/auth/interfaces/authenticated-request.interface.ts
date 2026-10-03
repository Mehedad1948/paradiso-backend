import { Request } from 'express';
import { ActiveUserData } from './active-user-data.interface';

export type AuthenticatedRequest = Request & { user: ActiveUserData };

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ROUTE = Symbol('amic-vault.public-route');

export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);

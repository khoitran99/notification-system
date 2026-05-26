import { PrismaClient } from './generated/prisma'

// Singleton — import `prisma` from '@notification/shared', never instantiate locally.
export const prisma = new PrismaClient()

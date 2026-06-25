import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.LOOP_ENGINEERING_DB
      ? `file:${process.env.LOOP_ENGINEERING_DB}`
      : 'file:./dev.db',
  },
});
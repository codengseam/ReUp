import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const dbUrl = process.env.LOOP_ENGINEERING_DB
  ? `file:${process.env.LOOP_ENGINEERING_DB}`
  : 'file:./dev.db';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: dbUrl,
  },
});
import { NextResponse } from 'next/server';
import { getAdminStats } from '@/server/db/admin-stats';

export async function GET() {
  try {
    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取统计数据失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// src/app/api/admin/analytics/route.ts
// Admin analytics overview API

import { NextRequest, NextResponse } from 'next/server';
import { getAnalyticsOverview } from '@/server/analytics/queries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const startDate = startParam ? new Date(startParam) : undefined;
    const endDate = endParam ? new Date(endParam) : undefined;

    const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const overview = await getAnalyticsOverview(startDate, endDate);

    return NextResponse.json({ ...overview, traceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取统计数据失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
'use client';

import { useEffect } from 'react';
import { ResumeAnalyzer } from '@/components/shared/resume/ResumeAnalyzer';
import { safeTrack } from '@/shared/utils/analytics-helpers';

export default function ResumePage() {
  useEffect(() => {
    safeTrack({ type: 'page_view', page: '/resume' });
  }, []);

  return <ResumeAnalyzer />;
}
'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full border-primary/20 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>出现了意外错误，请重试或刷新页面。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={reset} className="bg-primary hover:bg-primary/90">
            <RotateCcw className="w-4 h-4" />
            重试
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

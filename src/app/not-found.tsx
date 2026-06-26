import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Compass className="w-7 h-7 text-primary" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">页面不存在或已被移除。</p>
      <Button asChild className="bg-primary hover:bg-primary/90">
        <Link href="/">返回首页</Link>
      </Button>
    </div>
  );
}
